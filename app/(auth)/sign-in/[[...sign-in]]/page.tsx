import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";

import { LoginForm } from "../login-form";

const SignInPage = async () => {
  if (await currentUser()) redirect("/learn");
  return <LoginForm />;
};

export default SignInPage;
