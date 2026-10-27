import { useId, useState } from "react";

export type TicketTypeValues = {
  name: string;
  currency: string;
  priceMinor: number;
  quantity: number;
};

export function TicketTypeForm({ initial, minimumCapacity, editing, saving, onSave, onCancel }: {
  initial: TicketTypeValues;
  minimumCapacity: number;
  editing: boolean;
  saving: boolean;
  onSave: (values: TicketTypeValues) => Promise<void>;
  onCancel: () => void;
}) {
  const headingId = useId();
  const [error, setError] = useState("");

  return (
    <form className="ticket-type-form" aria-labelledby={headingId} onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      const data = new FormData(event.currentTarget);
      const name = String(data.get("name") ?? "").trim();
      const currency = String(data.get("currency") ?? "").trim().toUpperCase();
      const price = Number(data.get("price"));
      const quantity = Number(data.get("quantity"));
      setError("");
      if (!name || !/^[A-Z]{3}$/.test(currency)) {
        setError("Enter a ticket name and a three-letter currency code.");
        return;
      }
      if (!Number.isFinite(price) || price < 0 || price > 1_000_000 ||
          !Number.isInteger(quantity) || quantity < minimumCapacity || quantity > 100_000) {
        setError(`Enter a valid price and a capacity between ${minimumCapacity} and 100,000.`);
        return;
      }
      try {
        await onSave({ name, currency, priceMinor: Math.round(price * 100), quantity });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not save the ticket type. Try again.");
      }
    }}>
      <h4 id={headingId}>{editing ? "Edit ticket type" : "Add ticket type"}</h4>
      <fieldset disabled={saving}>
        <label>
          Ticket name
          <input name="name" defaultValue={initial.name} required maxLength={100} autoFocus />
        </label>
        <div className="form-row">
          <label>
            Currency
            <input name="currency" defaultValue={initial.currency} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" autoCapitalize="characters" />
          </label>
          <label>
            Ticket price
            <input name="price" type="number" defaultValue={(initial.priceMinor / 100).toFixed(2)} required min={0} max={1_000_000} step="0.01" />
          </label>
        </div>
        <label>
          Total ticket capacity
          <input name="quantity" type="number" defaultValue={initial.quantity} required min={minimumCapacity} max={100_000} step={1} />
          <small>{editing ? `Includes sold and reserved tickets. Minimum capacity: ${minimumCapacity}.` : "The total number of tickets available for this type."}</small>
        </label>
      </fieldset>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="event-actions">
        <button type="submit" disabled={saving} aria-busy={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add ticket type"}</button>
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
