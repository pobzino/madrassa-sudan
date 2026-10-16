import type { ReactNode } from "react";
import type { RigSpec } from "../rig";

export interface BossDef {
  /** Short display name (the app has its own localised names). */
  name: string;
  /** The rigged drawing, in a 0 0 200 200 box standing on y = 188. */
  Art: (props: { uid: string }) => ReactNode;
  spec: RigSpec;
}
