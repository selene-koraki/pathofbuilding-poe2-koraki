-- api/calcs — read computed outputs and breakdowns from the engine.
local serialize = require("serialize")

local M = {}

-- The formatted stat sidebar (engine-authoritative, colour-coded).
function M.getSidebar(K)
	local build = K.build()
	return { sidebar = serialize.sidebar(build), warnings = serialize.warnings(build) }
end

-- A single named output value from the main calc output (raw number).
-- params: { stat }  e.g. "FullDPS", "Life", "TotalEHP"
function M.getStat(K, params)
	local out = K.build().calcsTab.mainOutput
	return { stat = params.stat, value = out and out[params.stat] }
end

-- Resolve a possibly-dotted stat path (e.g. "Minion.TotalDPS") against a table.
local function resolve(out, name)
	local node = out
	for part in name:gmatch("[^.]+") do
		if type(node) ~= "table" then return nil end
		node = node[part]
	end
	return node
end

-- Bulk snapshot of the main output table (numbers only) — used by the numeric
-- parity harness to assert web == headless. Supports dotted paths for nested
-- actors like the minion. params: { stats? = {names...} }
function M.getOutput(K, params)
	local out = K.build().calcsTab.mainOutput or {}
	local result = {}
	if params and params.stats then
		for _, name in ipairs(params.stats) do
			local v = resolve(out, name)
			if type(v) == "number" then result[name] = v end
		end
	else
		for k, v in pairs(out) do
			if type(v) == "number" then
				result[k] = v
			elseif k == "Minion" and type(v) == "table" then
				for mk, mv in pairs(v) do
					if type(mv) == "number" then result["Minion." .. mk] = mv end
				end
			end
		end
	end
	return result
end

-- A serialized breakdown for one output stat (the CALCS-mode env carries the
-- engine's own breakdown lines, incl. the multiplicative chain + mod sources).
-- params: { stat, minion? }
function M.getBreakdown(K, params)
	local env = K.build().calcsTab.calcsEnv
	local actor = (params.minion and env and env.minion) or (env and env.player)
	local bd = actor and actor.breakdown and actor.breakdown[params.stat]
	if not bd then return { stat = params.stat, lines = {}, rows = {} } end

	local lines = {}
	for _, v in ipairs(bd) do
		if type(v) == "string" then lines[#lines + 1] = v end
	end

	-- Optional modifier-source table (rowList + colList) on richer breakdowns.
	local columns, rows = {}, {}
	if bd.colList then
		for _, c in ipairs(bd.colList) do columns[#columns + 1] = c.label or c.key or "" end
	end
	if bd.rowList then
		for _, row in ipairs(bd.rowList) do
			local cells = {}
			if bd.colList then
				for _, c in ipairs(bd.colList) do
					local v = row[c.key]
					cells[#cells + 1] = (type(v) == "number" or type(v) == "string") and tostring(v) or ""
				end
			else
				for k, v in pairs(row) do
					if type(v) == "number" or type(v) == "string" then
						cells[#cells + 1] = k .. "=" .. tostring(v)
					end
				end
			end
			rows[#rows + 1] = cells
		end
	end

	return { stat = params.stat, lines = lines, columns = columns, rows = rows }
end

-- What-if comparison: apply a sequence of mutation steps, read the resulting
-- output, then revert to the pre-comparison build. Powers "what does this node /
-- item / gem do" without committing. params: { steps = [{method,params}], stats? }
function M.compare(K, params)
	local steps = params.steps or {}
	local statsArg = params.stats
	local before = M.getOutput(K, { stats = statsArg })
	local snapshot = K.toXML() -- exact revert point
	local okAll, err = pcall(function()
		for _, step in ipairs(steps) do K.invoke(step.method, step.params) end
	end)
	local after = okAll and M.getOutput(K, { stats = statsArg }) or before
	-- Revert to the snapshot regardless of success.
	K.loadXML(K.loadedId, snapshot, K.loadedName)
	K.recompute()
	if not okAll then error(tostring(err)) end

	local deltas = {}
	local keys = {}
	for k in pairs(before) do keys[k] = true end
	for k in pairs(after) do keys[k] = true end
	for k in pairs(keys) do
		local b, a = before[k] or 0, after[k] or 0
		if a ~= b then deltas[#deltas + 1] = { stat = k, before = b, after = a, delta = a - b } end
	end
	table.sort(deltas, function(x, y) return math.abs(x.delta) > math.abs(y.delta) end)
	return { deltas = deltas }
end

return M
