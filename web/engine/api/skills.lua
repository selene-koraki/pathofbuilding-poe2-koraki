-- api/skills — Phase 1 ships the main socket-group / main-skill selectors that
-- the sidebar header drives. Full socket-group/gem editing arrives in Phase 2.
local serialize = require("serialize")

local M = {}

local function groupLabel(build, group, i)
	if group.displayLabel and group.displayLabel:match("%S") then return group.displayLabel end
	if group.label and group.label:match("%S") then return group.label end
	return "Group " .. i
end

-- Active skills displayable in a group (after ProcessSocketGroup populated them).
local function activeSkills(group)
	local out = {}
	for _, active in ipairs(group.displaySkillList or {}) do
		local name = active.activeEffect and active.activeEffect.grantedEffect
			and active.activeEffect.grantedEffect.name
		out[#out + 1] = name or "?"
	end
	return out
end

-- List socket groups + which is main, for the header selectors.
function M.listGroups(K)
	local build = K.build()
	local groups = {}
	for i, group in ipairs(build.skillsTab.socketGroupList or {}) do
		groups[#groups + 1] = {
			index = i,
			label = groupLabel(build, group, i),
			enabled = group.enabled ~= false,
			includeInFullDPS = group.includeInFullDPS or false,
			mainActiveSkill = group.mainActiveSkill or 1,
			skills = activeSkills(group),
		}
	end
	return { mainSocketGroup = build.mainSocketGroup, groups = groups }
end

-- params: { index }
function M.setMainGroup(K, params)
	local build = K.build()
	build.mainSocketGroup = tonumber(params.index)
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- params: { group?, skillIndex } — group defaults to the current main group.
function M.setMainSkill(K, params)
	local build = K.build()
	local gi = tonumber(params.group) or build.mainSocketGroup
	local group = build.skillsTab.socketGroupList[gi]
	if not group then error("no such socket group") end
	group.mainActiveSkill = tonumber(params.skillIndex) or 1
	build.buildFlag = true
	K.recompute()
	return serialize.state(K)
end

return M
