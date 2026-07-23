import { redirect } from "next/navigation";

/** The management index moved to /academias — courts are now managed inside
    their academia. Old bookmarks and links land there. */
export default function QuadrasPage() {
  redirect("/academias");
}
