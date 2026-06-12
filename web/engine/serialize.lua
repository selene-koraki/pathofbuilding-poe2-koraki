-- PoB2 Web — Engine-side serialization
--
-- Turns live engine objects into stable JSON-ready Lua tables (DTOs). The
-- contract mirrors web/shared/dto.ts. Colour escapes (^x, ^N) are passed
-- through untouched so the browser renders them with the PoE2 palette — the
-- engine stays the single source of truth for formatting.

local M = {}

-- The stat sidebar: build.controls.statBox.list is the exact formatted list the
-- desktop renders. Entries are:
--   { height, "label:", "value" }  -> a stat row (index 1 + 2 present)
--   { height, "text" }             -> a header / full-width info line (only 1)
--   { height }                     -> a spacer (neither)
function M.sidebar(build)
	local rows = {}
	for _, e in ipairs(build.controls.statBox.list or {}) do
		if e[1] and e[2] then
			rows[#rows + 1] = { label = e[1], value = e[2] }
		elseif e[1] then
			rows[#rows + 1] = { header = e[1] }
		else
			rows[#rows + 1] = { spacer = true }
		end
	end
	return rows
end

-- Warnings the engine raised for the current build (item/skill problems).
function M.warnings(build)
	local out = {}
	local w = build.controls.warnings and build.controls.warnings.lines
	if w then
		for _, line in ipairs(w) do out[#out + 1] = tostring(line) end
	end
	return out
end

-- Character/build metadata used by the sidebar header and library summaries.
function M.meta(build)
	local m = {}
	m.level = build.characterLevel
	if build.spec then
		m.className = build.spec.curClassName
		m.classId = build.spec.curClassId
		m.ascendancy = build.spec.curAscendClassName
		m.ascendancyId = build.spec.curAscendClassId
	end
	-- Main skill name (best-effort; absent on an empty build).
	pcall(function()
		local env = build.calcsTab and build.calcsTab.mainEnv
		if env and env.player and env.player.mainSkill then
			m.mainSkill = env.player.mainSkill.activeEffect.grantedEffect.name
		end
	end)
	-- A couple of headline numbers for library cards (best-effort).
	pcall(function()
		local out = build.calcsTab and build.calcsTab.mainOutput
		if out then
			m.fullDPS = out.FullDPS
			m.life = out.Life
			m.energyShield = out.EnergyShield
		end
	end)
	return m
end

-- The full per-build projection pushed after every mutation.
function M.state(K)
	local build = K.build()
	return {
		id = K.loadedId,
		name = K.loadedName,
		meta = M.meta(build),
		sidebar = M.sidebar(build),
		warnings = M.warnings(build),
	}
end

return M
