import { redirect } from "next/navigation";

/** Fuera del alcance (docs/alcance.md): lo que hacía esta pantalla vive en el inicio y en cada proyecto. */
export default function OutOfScopePage() {
  redirect("/app");
}
