---
description: Implement cash payment and change giving (Phase 4)
---

# Payment Flow & Change (Phase 4)

## Requirements
1. Implement change giving for cash payments.
2. Add cash payment amount input using the numpad.
3. Calculate change based on cash received and display it:
   - On the front screen via a full-screen popup.
   - On the back (customer-facing) screen.
   - On the receipt.
4. Back screen context: 2-line 20-character VFD/LCD customer display, typically connected via serial COM or USB; from a web app a local bridge/native wrapper is normally needed.

## Implementation Notes
- Reuse the existing numpad and popup components where possible.
- Format the change amount to match the project's currency display helpers.
- Abstract the customer-facing display output so it can be sent to a serial/USB bridge or Electron wrapper without coupling the UI to a specific device.
- Update the receipt template to include cash received and change returned.
- Keep cash, numpad, and display logic inside the relevant providers/components under `src/app/`.
