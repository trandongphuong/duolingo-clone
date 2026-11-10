import type { PropsWithChildren } from "react";

import { Header } from "./header";
import { DemoNotice } from "@/components/demo-notice";

const AuthLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <DemoNotice />

      <main className="flex flex-1 flex-col items-center justify-center">
        {children}
      </main>
    </div>
  );
};

export default AuthLayout;
