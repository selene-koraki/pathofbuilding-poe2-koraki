-- api/skills — socket groups, gems, supports, main skill, paste, Full DPS.
-- Calls the same SkillsTab logic methods the desktop UI uses; never renders.
local serialize = require("serialize")

local M = {}

local function tab(K) return K.build().skillsTab end

local function group(K, idx)
	local g = tab(K).socketGroupList[tonumber(idx)]
	if not g then error("no such socket group: " .. tostring(idx)) end
	return g
end

-- After a structural change, refresh display + undo + recompute.
local function commit(K, g)
	local sk = tab(K)
	if g then pcall(function() sk:ProcessSocketGroup(g) end) end
	pcall(function() sk:AddUndoState() end)
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

----------------------------------------------------------------------
-- Socket groups
----------------------------------------------------------------------
function M.listGroups(K)
	return serialize.skills(K.build())
end

-- params: { label? }
function M.addGroup(K, params)
	local g = { label = params.label or "", enabled = true, includeInFullDPS = false, gemList = {} }
	table.insert(tab(K).socketGroupList, g)
	return commit(K, g)
end

-- params: { index }
function M.removeGroup(K, params)
	local sk = tab(K)
	local idx = tonumber(params.index)
	local g = sk.socketGroupList[idx]
	if not g then error("no such socket group") end
	if g.source then error("cannot delete an item/passive-granted group") end
	table.remove(sk.socketGroupList, idx)
	local build = K.build()
	if build.mainSocketGroup > idx then
		build.mainSocketGroup = build.mainSocketGroup - 1
	elseif build.mainSocketGroup == idx then
		build.mainSocketGroup = math.max(1, math.min(build.mainSocketGroup, #sk.socketGroupList))
	end
	return commit(K, nil)
end

-- params: { index, label }
function M.renameGroup(K, params)
	group(K, params.index).label = tostring(params.label or "")
	return commit(K, group(K, params.index))
end

-- params: { index, enabled }
function M.setGroupEnabled(K, params)
	group(K, params.index).enabled = params.enabled ~= false
	return commit(K, group(K, params.index))
end

-- params: { index, include }  -- per-group "include in Full DPS"
function M.setGroupFullDPS(K, params)
	group(K, params.index).includeInFullDPS = params.include and true or false
	return commit(K, group(K, params.index))
end

-- params: { index, to }  -- reorder a group
function M.reorderGroup(K, params)
	local sk = tab(K)
	local from, to = tonumber(params.index), tonumber(params.to)
	local g = table.remove(sk.socketGroupList, from)
	if not g then error("no such socket group") end
	table.insert(sk.socketGroupList, math.max(1, math.min(to, #sk.socketGroupList + 1)), g)
	return commit(K, nil)
end

----------------------------------------------------------------------
-- Gems
----------------------------------------------------------------------
-- params: { group, nameSpec?, level?, quality? }
function M.addGem(K, params)
	local sk = tab(K)
	local g = group(K, params.group)
	local gem = {
		nameSpec = params.nameSpec or "",
		level = tonumber(params.level) or sk.defaultGemLevel or 20,
		quality = tonumber(params.quality) or sk.defaultGemQuality or 0,
		enabled = true,
		enableGlobal1 = true,
		enableGlobal2 = true,
		count = 1,
		corrupted = false,
		corruptLevel = 0,
	}
	table.insert(g.gemList, gem)
	return commit(K, g)
end

-- params: { group, index, nameSpec?|level?|quality?|enabled?|count? }
function M.setGem(K, params)
	local g = group(K, params.group)
	local gem = g.gemList[tonumber(params.index)]
	if not gem then error("no such gem") end
	if params.nameSpec ~= nil then gem.nameSpec = tostring(params.nameSpec) end
	if params.level ~= nil then gem.level = tonumber(params.level) end
	if params.quality ~= nil then gem.quality = tonumber(params.quality) end
	if params.enabled ~= nil then gem.enabled = params.enabled and true or false end
	if params.count ~= nil then gem.count = tonumber(params.count) end
	return commit(K, g)
end

-- params: { group, index }
function M.removeGem(K, params)
	local g = group(K, params.group)
	if not g.gemList[tonumber(params.index)] then error("no such gem") end
	table.remove(g.gemList, tonumber(params.index))
	return commit(K, g)
end

-- params: { group, from, to }
function M.reorderGem(K, params)
	local g = group(K, params.group)
	local gem = table.remove(g.gemList, tonumber(params.from))
	if not gem then error("no such gem") end
	table.insert(g.gemList, math.max(1, math.min(tonumber(params.to), #g.gemList + 1)), gem)
	return commit(K, g)
end

-- params: { text } — paste a socket group in the desktop text format.
function M.pasteGroup(K, params)
	tab(K):PasteSocketGroup(params.text or "")
	return commit(K, nil)
end

-- params: { q, limit? } — search the gem database by name (incl. supports).
function M.searchGems(K, params)
	local q = (params.q or ""):lower()
	local limit = tonumber(params.limit) or 40
	local out = {}
	for _, gem in pairs(K.build().data.gems or {}) do
		local name = gem.name
		if name and (q == "" or name:lower():find(q, 1, true)) then
			local support = gem.grantedEffect and gem.grantedEffect.support or false
			out[#out + 1] = { name = name, support = support and true or false }
			if #out >= limit then break end
		end
	end
	table.sort(out, function(a, b) return a.name < b.name end)
	return { gems = out }
end

----------------------------------------------------------------------
-- Main skill
----------------------------------------------------------------------
function M.setMainGroup(K, params)
	K.build().mainSocketGroup = tonumber(params.index)
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

function M.setMainSkill(K, params)
	local build = K.build()
	local gi = tonumber(params.group) or build.mainSocketGroup
	local g = build.skillsTab.socketGroupList[gi]
	if not g then error("no such socket group") end
	g.mainActiveSkill = tonumber(params.skillIndex) or 1
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

return M
