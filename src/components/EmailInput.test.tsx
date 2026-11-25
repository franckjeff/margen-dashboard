import { fireEvent, render, screen } from "@testing-library/react";
import { EMAIL_PROBLEM } from "../lib/email";
import { EmailInput } from "./ui";

const renderField = (required = false) => {
  const sent = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <form onSubmit={sent}>
      <label>
        Email
        <EmailInput name="email" required={required} />
      </label>
      <button type="submit">Save</button>
    </form>,
  );
  return { sent, input: screen.getByLabelText("Email") as HTMLInputElement };
};

describe("Email fields", () => {
  it("won't send an address with no domain ending, and says why", () => {
    const { sent, input } = renderField();
    fireEvent.change(input, { target: { value: "name@example" } });
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe(EMAIL_PROBLEM);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).not.toHaveBeenCalled();
  });

  it("sends a full address", () => {
    const { sent, input } = renderField();
    fireEvent.change(input, { target: { value: "name@example.com" } });
    fireEvent.input(input);
    expect(input.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toHaveBeenCalled();
  });

  it("lets an optional field stay empty", () => {
    const { input } = renderField();
    expect(input.checkValidity()).toBe(true);
  });
});
