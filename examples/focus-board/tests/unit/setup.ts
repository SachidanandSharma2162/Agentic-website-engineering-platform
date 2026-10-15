import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom does not implement the modal <dialog> API; this minimal stand-in follows the spec for open/close and the close event.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.removeAttribute("open");
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event("close"));
  };
}
