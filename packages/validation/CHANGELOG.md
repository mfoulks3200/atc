# @airtrafficcontrol/validation Changelog

## Unreleased

### Added

- `isAdversarialReviewVector(vector)` — returns true if a vector's type is `adversarial_review`. @see RULE-VEC-6
- `validateAdversarialReviewerIdentity(reviewerId, builderId)` — throws `VectorError` (RULE-VEC-8) when the reviewer is the same pilot as the builder (the pilot who filed the preceding vector report). @see RULE-VEC-7, RULE-VEC-8
- `validateAdversarialReviewerSeat(reviewerSeat)` — throws `VectorError` (RULE-VEC-9) when the reviewer holds a Jumpseat. @see RULE-VEC-9
