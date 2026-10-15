export {}; // makes this file a module so top-level await is allowed

// Shared setup. Component tests opt in to jsdom with `// @vitest-environment jsdom`; API and time tests stay in plain Node.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  const { afterEach } = await import("vitest");
  afterEach(() => cleanup());

  // jsdom does not implement scrolling or the modal <dialog> API.
  window.scrollTo = () => {};
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
}
