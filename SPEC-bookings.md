# Spec: Bookings with a deposit (حجز بعربون)

## Objective
A customer orders a feast for a later day and pays part of it now (e.g. 2,000 QAR today for an event in
3 days). The rest is paid on the event day. Today's cash or card must count in today's shift; the kitchen
must not get the order until the event day; nobody should forget an upcoming booking.

## Decisions (defaults; the owner can change any)
1. **The deposit is an invoice.** Saving a booking issues a normal invoice for the deposit amount only:
   one line «عربون حجز — عزومة يوم …», paid by cash or card. So it counts in the shift, the reports,
   cloud sync and the QR check with no new money path. No kitchen ticket is printed for it.
2. **The booking details ride on that invoice.** Event date and time, the planned items and their total
   are stored on the deposit invoice (new optional fields), so they sync to every device like invoices.
3. **Upcoming bookings list** on the till (cashier and manager), sorted by event date: customer, phone,
   event date, total, deposit, remaining. It reads from the cloud so a booking made on any device shows
   on the tablet too.
4. **Event day: «تنفيذ».** Loads the planned items into the cart (they can still be changed). Saving
   issues the final invoice for the full order with the deposit taken off: printed as
   «العربون المدفوع (فاتورة رقم …)» and the customer pays only the remainder. The kitchen ticket prints
   then. The booking leaves the upcoming list.
5. **Cancelling** is manager only and asks whether the deposit is refunded:
   refunded → the deposit invoice is cancelled (leaves the takings); kept → the booking is closed and the
   deposit stays as income.
6. Cashiers can create and carry out bookings; they cannot cancel them (same as invoices today).

## Data (Convex `invoices`, all optional, existing invoices unaffected)
- On the deposit invoice: `eventAt` (ISO local date-time, indexed), `booking` = { items, total, closed? }.
- On the final invoice: `deposit` (amount) and `depositNo` (the deposit invoice number).
- Server totals check becomes `total = base + vat − deposit`, with `0 ≤ deposit ≤ base + vat`.
- New query `invoices:bookings` (any signed-in account): deposit invoices with `eventAt` set that are
  active, not closed, and not yet followed by a final invoice.

## Out of scope
Reminders/notifications, several deposits on one booking, changing a booking after it is saved
(cancel and re-book instead), the A5 invoice layout beyond the deposit line.

## Testing
- convex-test: cashier can push a deposit invoice with `eventAt`/`booking`; totals with `deposit` are
  accepted and wrong ones refused; `bookings` lists open bookings and drops ones with a final invoice,
  cancelled or closed; cashier cannot close or cancel.
- Browser (preview + tablet): create a booking, see it in the list on another role, carry it out, check the
  printed final invoice shows the deposit and the remainder, and the shift slip counts the deposit today
  and only the remainder on the event day.

## Boundaries
- Always: backend deployed before the front end; version bump; tests + typecheck green.
- Ask first: anything that changes how existing invoices are stored or numbered.
- Never: delete or rewrite existing invoices.

## Open questions
1. Refund on cancel: decided per booking at cancel time (default above). OK?
2. Should the deposit receipt show the planned items, or only the deposit line and the event date?
   Default: shows both (items as information, total, deposit, remaining).
