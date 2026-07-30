import { RouterProvider } from "@tanstack/react-router";

import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

/**
 * Owns the renderer-wide atom registry. Runtime hosts are mounted by the
 * authenticated route shell so static routes such as parked sessions do not
 * initialize environment connections.
 */
export function AppRoot({ router }: { readonly router: AppRouter }) {
  return (
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
    </AppAtomRegistryProvider>
  );
}
