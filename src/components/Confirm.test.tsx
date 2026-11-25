import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfirmProvider, useConfirm } from "./Confirm";

function Asker({ message }: { message: string }) {
  const ask = useConfirm();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button type="button" onClick={async () => setAnswer(String(await ask(message)))}>
        Ask
      </button>
      <p data-testid="answer">{answer}</p>
    </>
  );
}

const renderAsker = (message: string) =>
  render(
    <ConfirmProvider>
      <Asker message={message} />
    </ConfirmProvider>,
  );

describe("Confirmation window", () => {
  it("asks in the app's own window, with the action as the button", async () => {
    const user = userEvent.setup();
    renderAsker("Delete 2 athletes? This can't be undone.\n\n  Al\n  Bea\n\n1 note will be deleted too.");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = screen.getByRole("dialog", { name: "Delete 2 athletes? This can't be undone." });
    expect(dialog).toHaveTextContent("1 note will be deleted too.");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByTestId("answer")).toHaveTextContent("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("answers no on Cancel, which has the focus", async () => {
    const user = userEvent.setup();
    renderAsker("Remove Al from your contacts?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("answer")).toHaveTextContent("false");
  });
});
