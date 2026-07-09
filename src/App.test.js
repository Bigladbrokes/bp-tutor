import { render, screen } from "@testing-library/react";
import LoginPage from "./pages/LoginPage";
import KaTeXRenderer from "./components/KaTeXRenderer";

test("renders the login page", () => {
  render(<LoginPage />);
  expect(screen.getByText(/B & P Tutor/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
});

test("KaTeXRenderer renders plain text unchanged", () => {
  render(<KaTeXRenderer text="no math here" />);
  expect(screen.getByText("no math here")).toBeInTheDocument();
});

test("KaTeXRenderer splits text around inline math", () => {
  const { container } = render(<KaTeXRenderer text="force $F = ma$ applies" />);
  expect(container.textContent).toContain("force");
  expect(container.textContent).toContain("applies");
  expect(container.querySelector(".katex")).not.toBeNull();
});

test("long equations get a horizontal scroll container", () => {
  const longEq = "(3x-1)^3 + (x-4)^3 = [(3x-1)+(x-4)][(3x-1)^2-(3x-1)(x-4)+(x-4)^2]";
  const { container } = render(<KaTeXRenderer text={`$${longEq}$`} />);
  expect(container.querySelector(".katex")).not.toBeNull();
  const scroller = [...container.querySelectorAll("span")].find(
    (el) => el.style.overflowX === "auto"
  );
  expect(scroller).toBeTruthy();
});

test("short inline math stays bare — no scroll wrapper", () => {
  const { container } = render(<KaTeXRenderer text="$F = ma$" />);
  const scroller = [...container.querySelectorAll("span")].find(
    (el) => el.style.overflowX === "auto"
  );
  expect(scroller).toBeFalsy();
});

test("block math always gets a scroll container", () => {
  const { container } = render(<KaTeXRenderer text="$$E=mc^2$$" />);
  const scroller = [...container.querySelectorAll("span")].find(
    (el) => el.style.overflowX === "auto"
  );
  expect(scroller).toBeTruthy();
});
