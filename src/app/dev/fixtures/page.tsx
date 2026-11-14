import { notFound } from "next/navigation";
import { FixtureLab } from "./fixture-lab";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <FixtureLab />;
}
