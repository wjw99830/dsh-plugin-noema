import { registerHooks } from "node:module";

// These tests stub Tooltip and do not cover its browser behavior
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@deepseek-ai/dsh-client-ui-primitives") {
      return {
        url: "data:text/javascript,export function Tooltip({children}) { return children }",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
