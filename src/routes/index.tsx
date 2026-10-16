import { createFileRoute } from "@tanstack/react-router";
import { DiningApp } from "@/components/dining-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <DiningApp />;
}
