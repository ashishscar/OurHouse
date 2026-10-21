/* OurHouse Ambient Intelligence
   Deterministic, private household reasoning. This file runs in a Web Worker
   so planning signals never make scrolling or taps wait. It is also exported
   for the automatic test suite. No household data leaves the device. */
(function (root) {
  "use strict";

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;

  function deriveHouseholdIntelligence(snapshot) {
    const s = snapshot && typeof snapshot === "object" ? snapshot : {};
    const tonight = s.tonight || {};
    const week = s.week || {};
    const pantry = s.pantry || {};
    const grocery = s.grocery || {};
    const sabha = s.sabha || {};
    const duties = s.duties || {};
    const low = Array.isArray(pantry.low) ? pantry.low : [];
    const soon = Array.isArray(pantry.runningOutSoon) ? pantry.runningOutSoon : [];
    const shortages = Array.isArray(week.shortages) ? week.shortages : [];
    const plannedDays = Number(week.plannedDays) || 0;
    const openGrocery = Number(grocery.openCount) || 0;

    let score = 100;
    const factors = [];
    const deduct = (label, amount, detail) => {
      const points = Math.max(0, Math.round(amount));
      if (!points) return;
      score -= points;
      factors.push({ label, impact: -points, detail });
    };

    if (!tonight.planned) deduct("Tonight", 22, "Dinner has not been planned yet");
    else if (!tonight.cooked && Number(tonight.coverage) < 1) {
      deduct("Dinner readiness", Math.round((1 - clamp(Number(tonight.coverage) || 0, 0, 1)) * 16), "Some planned ingredients are not covered by recorded pantry stock");
    }
    deduct("Low stock", Math.min(22, low.length * 4), plural(low.length, "item") + " at or below its alert level");
    deduct("Week supply", Math.min(18, shortages.length * 4), plural(shortages.length, "planned ingredient") + " not covered by stock");
    deduct("Unfinished shopping", Math.min(10, Math.ceil(openGrocery / 5) * 2), plural(openGrocery, "item") + " still on the grocery list");
    if (sabha.active && !sabha.myResponse) deduct("Meetup", 7, "Your response is still waiting");
    if (Number(duties.total) > 0 && Number(duties.assigned) < Number(duties.total)) deduct("Duties", 6, "One or more duties are unassigned");
    if (Number(pantry.staleCount) > 0) deduct("Stock freshness", Math.min(5, Number(pantry.staleCount)), "Some quantities have not been updated recently");
    score = clamp(Math.round(score), 0, 100);

    const recommendations = [];
    const add = (id, priority, level, title, detail, evidence, action, confidence) => recommendations.push({
      id, priority, level, title, detail, evidence, action, confidence: clamp(confidence, 0, 1),
    });

    const integrity=s.integrity||{};
    if(Number(integrity.conflicts)>0||Number(integrity.unsent)>0){
      add("unsaved-data",120,"critical","Your latest changes need confirmation",`${Number(integrity.unsent)||0} changes are kept on this phone; ${Number(integrity.conflicts)||0} need review.`,"The server has not confirmed these saved edits.","open_pending",1);
    }
    if(Number(integrity.brokenReferences)>0){
      add("broken-plan",118,"warning","Review missing meal-plan recipes",`${integrity.brokenReferences} planned references are missing or removed.`,"Recipe IDs were checked against the synced shared library. Existing plans have been retained.","open_integrity",1);
    }
    if(Number(integrity.duplicates)>0){
      add("copied-recipes",116,"warning","Copied recipes detected",`${integrity.duplicates} exact copies can be linked without deleting the originals.`,"Name, ingredient quantities, servings and fasting flag match. Different recipes are kept separate.","open_integrity",1);
    }

    if (!tonight.planned) {
      add("plan-tonight", 100, "critical", "Plan tonight before the day gets busy", "Choose one dish now, or ask OurHouse to create a plan from the shared library.", "Tonight has no dish assigned.", "plan_tonight", 0.99);
    } else if (!tonight.cooked && Number(tonight.coverage) < 1) {
      const missing = Array.isArray(tonight.missing) ? tonight.missing.slice(0, 3) : [];
      add("dinner-gap", 96, "warning", "Close tonight’s ingredient gap", missing.length ? `Check ${missing.join(", ")} before cooking.` : "Check the pantry before cooking.", `${Math.round(clamp(Number(tonight.coverage) || 0, 0, 1) * 100)}% of measured ingredients are covered.`, "sync_grocery", 0.94);
    }

    if (shortages.length) {
      add("week-supply", 90, "warning", "Protect the rest of the week", `Add ${shortages.slice(0, 4).join(", ")}${shortages.length > 4 ? "…" : ""} to the live shopping projection.`, `${plural(shortages.length, "planned ingredient")} exceed recorded stock.`, "sync_grocery", 0.93);
    }
    if (low.length) {
      add("low-stock", 84, "warning", "Restock the pantry’s weak points", `${low.slice(0, 4).join(", ")}${low.length > 4 ? "…" : ""} need attention.`, "Quantities are at or below the alert levels set by this house.", "open_pantry", 0.98);
    }
    if (soon.length) {
      add("depletion", 80, "opportunity", "Get ahead of likely depletion", `${soon.slice(0, 3).map(x => x.name).join(", ")}${soon.length > 3 ? "…" : ""} may run out soon.`, "This estimate uses this house’s measured cooking consumption history.", "open_pantry", 0.82);
    }
    if (openGrocery) {
      add("shopping", 68, "opportunity", "Finish the active shopping loop", `${plural(openGrocery, "item")} remain unchecked.`, "The shared grocery list still has open items.", "open_grocery", 0.99);
    }
    if (sabha.active && !sabha.myResponse) {
      add("sabha", 76, "opportunity", "Reply to Meetup", `${sabha.title || "Weekly Meetup"} is ${sabha.when || "coming up"}.`, "No response is saved for your account.", "open_sabha", 0.99);
    }
    if (Number(duties.total) > 0 && Number(duties.assigned) < Number(duties.total)) {
      add("duties", 64, "opportunity", "Complete the duty rotation", `${Number(duties.total) - Number(duties.assigned)} duty slot${Number(duties.total) - Number(duties.assigned) === 1 ? " is" : "s are"} still unassigned.`, "Calculated from this week’s rotation.", "open_duties", 0.99);
    }
    if (plannedDays < 5) {
      add("week-plan", 55, "opportunity", "Give the week more shape", `${plannedDays} of 7 dinners are planned.`, "A fuller plan makes the grocery projection more accurate.", "open_week", 0.99);
    }
    if (!recommendations.length) {
      add("steady", 10, "calm", "Everything important is in rhythm", "Dinner, supplies, duties, and Meetup are currently covered.", "No actionable gaps were found in the latest household snapshot.", "none", 0.97);
    }
    recommendations.sort((a, b) => b.priority - a.priority);

    const top = recommendations[0];
    let state = "In rhythm", stateTone = "calm";
    if (score < 55) { state = "Action needed"; stateTone = "critical"; }
    else if (score < 78) { state = "Needs attention"; stateTone = "warning"; }
    else if (score < 92) { state = "Nearly ready"; stateTone = "opportunity"; }

    const brief = top.level === "calm"
      ? "Your house is ready. I’ll keep watching the plan, supplies, duties, and Meetup quietly."
      : top.title + ". " + top.detail;
    const timeline = [
      { window: "Now", title: tonight.planned ? (tonight.cooked ? "Dinner complete" : tonight.names.join(" · ") || "Dinner planned") : "Dinner decision", status: tonight.planned ? "covered" : "attention" },
      { window: "Next 48h", title: shortages.length ? `${plural(shortages.length, "supply gap")} detected` : "Planned meals covered", status: shortages.length ? "attention" : "covered" },
      { window: "This week", title: `${plannedDays}/7 dinners planned · ${openGrocery} groceries open`, status: plannedDays >= 5 && !openGrocery ? "covered" : "watch" },
    ];

    return {
      version: 1,
      house: String(s.house || ""),
      generatedAt: Date.now(),
      score,
      state,
      stateTone,
      brief,
      recommendations: recommendations.slice(0, 6),
      factors: factors.sort((a, b) => a.impact - b.impact),
      timeline,
      signals: {
        plannedDays,
        lowCount: low.length,
        shortageCount: shortages.length,
        groceryCount: openGrocery,
        learnedForecasts: soon.length,
      },
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { deriveHouseholdIntelligence };
  if (root) root.deriveHouseholdIntelligence = deriveHouseholdIntelligence;
  if (root && typeof document === "undefined" && typeof root.addEventListener === "function") {
    root.addEventListener("message", function (event) {
      const data = event && event.data || {};
      try {
        root.postMessage({ seq: data.seq, result: deriveHouseholdIntelligence(data.snapshot) });
      } catch (error) {
        root.postMessage({ seq: data.seq, error: String(error && error.message || error) });
      }
    });
  }
})(typeof self !== "undefined" ? self : null);
