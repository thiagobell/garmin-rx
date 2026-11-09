# GarminAnalysis

A personal medication and biometrics dashboard for comparing structured self-reports with Garmin data.

## Language

**Medication Self-Report**:
Structured, doctor-visible subjective ratings of both desirable and undesirable medication effects. It records experience rather than medication administration and is quantitative even when accompanied by a separate free-text note.
_Avoid_: Qualitative report, upside report, dose log

**Daily Check-in**:
The single editable Medication Self-Report for a selected Reporting Date, describing that day as a whole. An unanswered rating is unknown and is not equivalent to a rating of zero.
_Avoid_: Midday check-in, evening check-in, peak-effect report, dose questionnaire

**Reporting Date**:
The watch-local calendar date whose overall experience is being rated. It defaults to today and can be overridden independently of when the check-in is submitted.
_Avoid_: Submission date, browser date

**Overall Day Rating**:
An additional standalone judgment of the day, never a composite or substitute for the separate desirable and undesirable effect ratings.
_Avoid_: Net benefit score, composite score

**Private Note**:
Owner-only free-text reflection associated with a calendar date and excluded from Guest View.
_Avoid_: Public note, doctor-visible note
