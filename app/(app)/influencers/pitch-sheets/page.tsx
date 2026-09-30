import { redirect } from "next/navigation";

/** Pitch sheets moved to the Brands workspace — they're what a brand receives. */
export default function OldPitchSheetsRedirect() {
  redirect("/brands/pitch-sheets");
}
