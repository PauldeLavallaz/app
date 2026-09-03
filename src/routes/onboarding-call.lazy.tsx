import {
  BookcallForm,
  OnboardingCall,
} from "@/components/bookcall/BookcallForm";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/onboarding-call")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OnboardingCall />;
}
