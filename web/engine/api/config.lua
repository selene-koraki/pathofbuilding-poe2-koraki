-- api/config — configuration options (toggles, conditions, enemy, map mods,
-- quest-reward campaign buffs, custom modifiers). The schema is generated from
-- the engine's own ConfigOptions list, so it tracks upstream automatically.
local serialize = require("serialize")

local M = {}

-- Resolve an option's default value the same way ConfigTab seeds it.
local function defaultValue(v)
	if v.type == "list" then
		local idx = v.defaultIndex or 1
		local entry = v.list and v.list[idx]
		return entry and entry.val
	elseif v.type == "check" then
		return v.defaultState or false
	elseif v.type == "text" then
		return v.defaultState or ""
	else
		return v.defaultState -- count/integer/float: may be nil (placeholder)
	end
end

-- Serialize a dropdown list to [{val,label}] (drop functions).
local function serList(list)
	if not list then return nil end
	local out = {}
	for _, e in ipairs(list) do
		out[#out + 1] = { val = e.val, label = e.label }
	end
	return out
end

-- The full option schema: ordered sections, each with its options. Mirrors the
-- desktop Config tab layout (var/type/label/list/default/tooltip + section/col).
function M.getSchema(K)
	local varList = LoadModule("Modules/ConfigOptions")
	local sections = {}
	local current = nil
	for _, v in ipairs(varList) do
		if v.section then
			current = { section = v.section, col = v.col, options = {} }
			sections[#sections + 1] = current
		elseif v.var and current then
			current.options[#current.options + 1] = {
				var = v.var,
				type = v.type,
				label = v.label,
				list = serList(v.list),
				default = defaultValue(v),
				tooltip = type(v.tooltip) == "string" and v.tooltip or nil,
			}
		end
	end
	return { sections = sections }
end

-- The set of vars the desktop would currently *show* (conditions met + search).
-- Lets the UI hide situational options exactly like the desktop.
function M.getShown(K)
	local shown = {}
	local controls = K.build().configTab.varControls or {}
	for var, control in pairs(controls) do
		local ok, vis = pcall(function() return control:IsShown() end)
		if ok and vis then shown[#shown + 1] = var end
	end
	return { shown = shown }
end

-- Current config values (JSON-serializable scalars only).
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
	-- nil clears the value (back to placeholder/default).
	build.configTab.input[params.var] = params.value
	build.configTab:AddUndoState()
	build.configTab:BuildModList()
	build.configTab.modFlag = true
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

return M
