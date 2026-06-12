-- api/config — configuration options (toggles, conditions, enemy, map mods,
-- quest-reward buffs, custom modifiers).
--
-- Phase 0 ships get/set so the recompute loop is exercised end-to-end; the full
-- ConfigOptions->form schema generation is built out in Phase 1 (getSchema).
local serialize = require("serialize")

local M = {}

-- Current config values (only JSON-serializable scalars).
function M.get(K)
	local input = K.build().configTab.input or {}
	local out = {}
	for k, v in pairs(input) do
		local t = type(v)
		if t == "string" or t == "number" or t == "boolean" then out[k] = v end
	end
	return { input = out }
end

-- Set one config value and recompute. params: { var, value }
function M.set(K, params)
	local build = K.build()
	if not params.var then error("config.set requires 'var'") end
	build.configTab.input[params.var] = params.value
	build.configTab:BuildModList()
	build.configTab.modFlag = true
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

return M
