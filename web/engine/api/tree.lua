-- api/tree — passive tree geometry export + allocation/path/mastery/power/specs.
-- The engine stays authoritative for which nodes are allocated and what they do;
-- the renderer only reflects this and sends intents.
local serialize = require("serialize")

local M = {}

local function spec(K) return K.build().spec end

-- Connections out of a node, as a list of target ids (dedup happens client-side).
local function connsOf(node)
	local out = {}
	if node.connections then
		for _, c in ipairs(node.connections) do
			local id = c.id or (c.node and c.node.id)
			if id then out[#out + 1] = id end
		end
	elseif node.linked then
		for _, ln in ipairs(node.linked) do out[#out + 1] = ln.id end
	end
	return out
end

-- Full geometry for a tree version: nodes (lean), groups, constants. Served once
-- and cached by the client; stat text is fetched per-node on demand.
function M.getData(K)
	local s = spec(K)
	local nodes = {}
	for id, node in pairs(s.nodes) do
		if node.x and node.y and node.type ~= "OnlyImage" then
			nodes[#nodes + 1] = {
				id = id,
				x = node.x,
				y = node.y,
				type = node.type,
				name = node.dn,
				ascendancy = node.ascendancyName,
				isMastery = node.isMastery or node.type == "Mastery" or nil,
				group = node.g,
				orbit = node.o,
				conns = connsOf(node),
			}
		end
	end
	local groups = {}
	for id, g in pairs(s.tree.groups or {}) do
		groups[#groups + 1] = { id = id, x = g.x, y = g.y }
	end
	return {
		version = s.treeVersion,
		scaleImage = s.tree.scaleImage or 1,
		nodes = nodes,
		groups = groups,
	}
end

-- Stat text + meta for one node (tooltip on hover). params: { id }
function M.getNode(K, params)
	local node = spec(K).nodes[tonumber(params.id)]
	if not node then error("no such node") end
	return {
		id = node.id,
		name = node.dn,
		type = node.type,
		ascendancy = node.ascendancyName,
		stats = node.sd or {},
		alloc = node.alloc or false,
	}
end

function M.getAllocated(K)
	return serialize.tree(K.build())
end

-- params: { id }
function M.allocNode(K, params)
	local s = spec(K)
	local node = s.nodes[tonumber(params.id)]
	if not node then error("no such node") end
	s:AllocNode(node)
	s:AddUndoState()
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- params: { id }
function M.deallocNode(K, params)
	local s = spec(K)
	local node = s.nodes[tonumber(params.id)]
	if not node then error("no such node") end
	s:DeallocNode(node)
	s:AddUndoState()
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- Shift-hover preview: the nodes that allocating { id } would add + the cost.
function M.previewPath(K, params)
	local s = spec(K)
	local node = s.nodes[tonumber(params.id)]
	if not node then error("no such node") end
	local ids = {}
	for _, p in ipairs(node.path or {}) do ids[#ids + 1] = p.id end
	return { path = ids, cost = node.pathDist or #ids }
end

-- params: { q } — node ids whose name or stats match.
function M.search(K, params)
	local q = (params.q or ""):lower()
	if q == "" then return { ids = {} } end
	local ids = {}
	for id, node in pairs(spec(K).nodes) do
		if node.type ~= "OnlyImage" then
			local hit = node.dn and node.dn:lower():find(q, 1, true)
			if not hit and node.sd then
				for _, line in ipairs(node.sd) do
					if line:lower():find(q, 1, true) then hit = true break end
				end
			end
			if hit then ids[#ids + 1] = id end
		end
	end
	return { ids = ids }
end

-- Mastery effect options for a mastery node. params: { id }
function M.getMasteryEffects(K, params)
	local node = spec(K).nodes[tonumber(params.id)]
	if not node or not node.masteryEffects then return { effects = {} } end
	local effects = {}
	for _, e in ipairs(node.masteryEffects) do
		effects[#effects + 1] = { effect = e.effect, sd = e.sd }
	end
	return { effects = effects, selected = spec(K).masterySelections[tonumber(params.id)] }
end

-- params: { id, effect }
function M.setMastery(K, params)
	local s = spec(K)
	s.masterySelections[tonumber(params.id)] = tonumber(params.effect)
	s:BuildAllDependsAndPaths()
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- params: { id }
function M.clearMastery(K, params)
	local s = spec(K)
	s.masterySelections[tonumber(params.id)] = nil
	s:BuildAllDependsAndPaths()
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- Node power for the offence/defence heatmap. Runs BuildPower to completion.
-- params: { } -> { power = { [id] = {offence, defence} }, maxOffence, maxDefence }
function M.power(K)
	local ct = K.build().calcsTab
	ct.powerBuildFlag = true
	for _ = 1, 100000 do
		ct:BuildPower()
		if not ct.powerBuilder then break end
	end
	local power, maxO, maxD = {}, 0, 0
	for id, node in pairs(spec(K).nodes) do
		if node.power and (node.power.offence or node.power.defence) then
			local o = node.power.offence or 0
			local d = node.power.defence or 0
			power[tostring(id)] = { offence = o, defence = d }
			if o > maxO then maxO = o end
			if d > maxD then maxD = d end
		end
	end
	return { power = power, maxOffence = maxO, maxDefence = maxD }
end

-- params: { mode } — 0 normal, 1 weapon set I, 2 weapon set II.
function M.setAllocMode(K, params)
	spec(K).allocMode = tonumber(params.mode) or 0
	return serialize.state(K)
end

----------------------------------------------------------------------
-- Tree specs (loadouts)
----------------------------------------------------------------------
function M.listSpecs(K)
	local tt = K.build().treeTab
	local specs = {}
	for i, sp in ipairs(tt.specList) do
		specs[#specs + 1] = { index = i, title = sp.title or ("Tree " .. i), version = sp.treeVersion }
	end
	return { specs = specs, active = tt.activeSpec }
end

-- params: { index }
function M.selectSpec(K, params)
	K.build().treeTab:SetActiveSpec(tonumber(params.index))
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

return M
