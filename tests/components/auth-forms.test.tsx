// @vitest-environment jsdom
import "../support/dom";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ForgotForm } from "@/components/auth/forgot-form";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { ResetForm } from "@/components/auth/reset-form";
import { PasswordForm } from "@/components/settings/password-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/auth-client", () => ({ authClient: {} }));

// If the page has not hydrated yet, the browser submits the form itself. It must POST, never GET, or the
// password would end up in the address bar, history and server logs.
describe("forms that carry passwords never fall back to GET", () => {
  it.each([
    ["login", <LoginForm key="a" />],
    ["register", <RegisterForm key="b" />],
    ["forgot", <ForgotForm key="c" />],
    ["reset", <ResetForm key="d" token="t" />],
    ["change password", <PasswordForm key="e" />],
  ])("%s form posts", (_name, ui) => {
    const { container } = render(ui);
    expect(container.querySelector("form")).toHaveAttribute("method", "post");
  });
});

describe("sign-up consent notice", () => {
  it("links to the Terms and the Privacy Policy next to the button", async () => {
    const { screen } = await import("@testing-library/react");
    render(<RegisterForm />);
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});
