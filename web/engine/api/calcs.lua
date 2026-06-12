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

-- Bulk snapshot of the main output table (numbers only) — used by the numeric
-- parity harness to assert web == headless. params: { stats? = {names...} }
function M.getOutput(K, params)
	local out = K.build().calcsTab.mainOutput or {}
	local result = {}
	if params and params.stats then
		for _, name in ipairs(params.stats) do
			local v = out[name]
			if type(v) == "number" then result[name] = v end
		end
	else
		for k, v in pairs(out) do
			if type(v) == "number" then result[k] = v end
		end
	end
	return result
end

return M
