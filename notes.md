# Project Notes

## Problem Overview
Chipotle manager needs a better workforce-sharing system across 10+ nearby stores.
Current flow: requesting manager → group chat of managers → each manager texts their off-duty crew → crew replies to their manager → manager reports back.
This is slow, especially for same-day needs. Too many manual hops.

## Current System Details
- Communication: WhatsApp/SMS group chat of managers (~10+ stores)
- Request info sent: store location, role/position needed, start/end time, number of people
- Timing: mostly same-day, sometimes 1-2 days out
- Flow is entirely manager-mediated — crew never interact directly with the requesting manager
- 10+ stores in the immediate cluster

## Key Requirements
- Reduce hops between request and confirmed worker
- Handle same-day urgency
- Capture: store location, role, shift time, headcount needed
- Work across 10+ stores

## Constraints / Considerations
- Independent from Chipotle corporate — no integration with internal systems required
- Chipotle has an internal scheduling app (unknown API access)
- Crew members have smartphones — SMS or web app both viable
- Start with one cluster (~10+ stores), design to scale to other regions later
- Builder: user has CS background and will direct AI agents to build it

## Build Plan
Full agent build plan saved to agents.md — 6 phases, suggested order: Setup → Registration → Auth → Dashboard → SMS → Polish.

## Decisions Made
- Option B selected: broadcast shift requests directly to all workers at neighboring stores for the matching role. Workers self-select by replying. No schedule syncing needed.
- Workers self-register using their unique Chipotle employee number (acts as verification), plus name, phone, store, and role(s)
- Roles: Line Crew, Cashier, Prep, Kitchen
- Managers post shift requests via a web dashboard

## Core Flow (Option B)
1. Manager submits a shift request: role, store, date, start/end time, # of people needed
2. System broadcasts SMS to all registered workers across neighboring stores who match that role
3. Workers reply "YES" to claim the shift
4. First N workers to respond get confirmed (N = headcount needed)
5. Requesting manager gets real-time confirmations
6. Once filled, system notifies remaining workers the shift is taken
