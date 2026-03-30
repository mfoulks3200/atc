/**
 * Hookable moments in the craft lifecycle.
 *
 * Before-events fire before a transition and can gate it.
 * After-events fire after a transition completes and are observational.
 *
 * @see RULE-CHKL-8 — extensible by adding new enum values.
 */
export enum LifecycleEvent {
  /** Fires before Taxiing → InFlight. */
  BeforeTakeoff = "before:takeoff",
  /** Fires after Taxiing → InFlight completes. */
  AfterTakeoff = "after:takeoff",
  /** Fires before reportVector() executes. */
  BeforeVectorComplete = "before:vector-complete",
  /** Fires after vector report is recorded. */
  AfterVectorComplete = "after:vector-complete",
  /** Fires before LandingChecklist → ClearedToLand. */
  BeforeLandingCheck = "before:landing-check",
  /** Fires after landing check passes. */
  AfterLandingCheck = "after:landing-check",
  /** Fires before GoAround → LandingChecklist. */
  BeforeGoAround = "before:go-around",
  /** Fires after go-around re-attempt begins. */
  AfterGoAround = "after:go-around",
  /** Fires before GoAround → Emergency. */
  BeforeEmergency = "before:emergency",
  /** Fires after emergency is declared. */
  AfterEmergency = "after:emergency",
  /** Fires before ClearedToLand → Landed. */
  BeforeLanding = "before:landing",
  /** Fires after branch is merged. */
  AfterLanding = "after:landing",
}
