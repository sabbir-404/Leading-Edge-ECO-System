# MAKE Interactive Tutorial Architecture & Specification (V1.2)

## 1. Overview
The MAKE Interactive Tutorial is a dedicated onboarding and guided workflow system built specifically for the MAKE module. It navigates users across the complete manufacturing and order pipeline through 8 canonical steps, automatically synchronizing route transitions, polling for rendered DOM targets, and highlighting UI components with an illuminated spotlight overlay.

---

## 2. Canonical 8-Step Pipeline & Target Map

The tutorial guides users across 4 distinct application routes without requiring manual navigation:

| Step # | Step ID | Application Route | Target Selector (`data-tutorial`) | Highlight Focus & Purpose |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `dashboard` | `/make/dashboard` | `[data-tutorial="make-dashboard"]` | Real-time production KPI cards, active orders, and status gauges |
| **2** | `catalog` | `/make/products` | `[data-tutorial="make-product-catalog"]` | Global Attributes (Categories, Sizes, Colors, Specs) and Catalog items |
| **3** | `search` | `/make/place-order` | `[data-tutorial="make-product-search"]` | Whole-catalog intelligent search bar with multi-attribute query parsing |
| **4** | `place-order` | `/make/place-order` | `[data-tutorial="make-place-order"]` | Custom order details, customer info (phone optional), and item builder |
| **5** | `attachments` | `/make/place-order` | `[data-tutorial="make-invoice-attachments"]` | PDF invoices, CAD drawings, NAS storage attachments |
| **6** | `track-orders` | `/make/track` | `[data-tutorial="make-track-orders"]` | Live manufacturing board, filters, search, and production statuses |
| **7** | `production-stages` | `/make/track` | `[data-tutorial="make-production-stages"]` | Canonical 8-stage pipeline progression banner (WIP through Delivered) |
| **8** | `customer-ledger` | `/crm/ledger` | `[data-tutorial="make-customer-ledger"]` | Real-time financial ledger, invoices, advance payments, and balances |

---

## 3. Centralized Controller Architecture

### 3.1 Flow Controller (`MakeTutorial.tsx`)
```text
Tutorial Controller (MakeTutorial.tsx)
      ↓
Current Step (1 of 8)
      ↓
Check Step Route vs Current Location (useLocation)
      ↓
If Mismatch → navigate(step.route)
      ↓
Poll DOM for Target (interval 100ms, timeout 2500ms)
      ↓
Calculate Target Bounding Box & Viewport Clamping
      ↓
Position Spotlight Overlay & Tooltip Card
      ↓
User presses "Next" → Step Increment
```

### 3.2 Target Polling & Graceful Fallback
1. When navigating to a new route, the target element may take a few frames or network cycles to render.
2. The controller polls `document.querySelector(step.target)` every 100ms up to 2.5 seconds.
3. If found: Smoothly scroll target into view, position spotlight rectangle, and render tooltip anchored adjacent to the target.
4. If target is unavailable after timeout:
   - Logs warning with step ID, route, and target selector.
   - Falls back gracefully to a centered modal presentation without breaking the walkthrough or stranding the user.

---

## 4. Per-User State Machine & Replay Flow

### 4.1 State Definitions (`tutorialState.ts`)
Each user's state is stored under isolated localStorage keys (`make_tutorial_state_${userId}`):
* `unseen`: New user who hasn't opened MAKE. The tutorial prompt card appears on first visit to `/make/dashboard`.
* `skipped`: User clicked "Skip" or dismissed the tutorial. Will not prompt again automatically.
* `completed`: User finished all 8 steps. Will not prompt again automatically.
* `replay_requested`: User clicked "Replay MAKE Tutorial" in Settings.

### 4.2 Replay Execution with Zero-Reload-Loop Guarantee
When a user requests a replay from Settings (`/settings`):
```text
User clicks [Replay MAKE Tutorial]
        ↓
requestTutorialReplay(userId)
  - Sets localStorage: make_tutorial_replay_${userId} = "true"
        ↓
window.location.hash = "#/make/dashboard"
window.location.reload()
        ↓
MakeTutorial mounts on MAKE Dashboard
        ↓
consumeTutorialReplay(userId)
  - Immediately removes make_tutorial_replay_${userId} from localStorage
  - Sets currentStep = 0, isActive = true
        ↓
Tutorial runs from Step 1 to Step 8
        ↓
On Finish or Dismiss → setTutorialState(userId, 'completed')
```
* **Loop Prevention**: Because the replay flag is removed synchronously upon first consumption, subsequent page refreshes cannot trigger another replay.

---

## 5. Non-Destructive Invariant

The tutorial is strictly informational and non-destructive:
* Does **not** insert or alter any products in the catalog.
* Does **not** place orders or modify existing customer orders.
* Does **not** advance production stages or mutate order statuses.
* Does **not** modify financial records or ledger balances.
* Navigating between pages uses standard React Router hash navigation, preserving form states where possible without submitting forms.
