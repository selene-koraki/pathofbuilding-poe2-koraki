-- api/character — level / class / ascendancy controls.
local serialize = require("serialize")

local M = {}

function M.getMeta(K)
	return serialize.meta(K.build())
end

-- params: { level }
function M.setLevel(K, params)
	local build = K.build()
	local lvl = tonumber(params.level)
	if not lvl or lvl < 1 or lvl > 100 then error("level must be 1..100") end
	build.characterLevel = lvl
	-- Mirror the desktop level edit (Build.lua level EditControl): a manual level
	-- turns OFF auto mode, else OnFrame recomputes the level back from progress.
	build.characterLevelAutoMode = false
	pcall(function() build.configTab:BuildModList() end)
	K.recompute()
	return serialize.state(K)
end

-- params: { classId }  (numeric class id on the passive tree)
function M.setClass(K, params)
	local build = K.build()
	build.spec:SelectClass(tonumber(params.classId))
	build.spec:AddUndoState()
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- params: { ascendClassId }
function M.setAscendancy(K, params)
	local build = K.build()
	build.spec:SelectAscendClass(tonumber(params.ascendClassId))
	build.spec:AddUndoState()
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

return M
