import { useEffect, useRef } from "react";

// ─── useFocusRetention (H5.1b item c) ───────────────────────────────────────
//
// A button whose `disabled` prop tracks an in-flight async action (Save,
// Generate, Subscribe, top-up, ...) gets forcibly blurred by the browser the
// instant it becomes disabled — React re-enabling it afterward does NOT
// restore focus on its own. A keyboard user who clicks/activates one of
// these loses their place the moment the request starts, landing on
// <body>. Attach the returned ref to that same button; once `isBusy` flips
// back to false, focus returns to it automatically.

export function useFocusRetention<T extends HTMLElement>(isBusy: boolean) {
  const ref = useRef<T>(null);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (!isBusy && wasBusy.current) ref.current?.focus();
    wasBusy.current = isBusy;
  }, [isBusy]);

  return ref;
}
