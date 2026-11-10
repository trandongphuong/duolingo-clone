"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { signIn } from "../actions";

export const LoginForm = () => {
  const [state, action, pending] = useActionState(signIn, { error: "" });
  return (
    <form
      action={action}
      className="w-full max-w-sm space-y-5 rounded-2xl border-2 border-slate-200 bg-white p-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Đăng nhập nội bộ</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sử dụng tài khoản do quản trị viên cấp.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="username" className="block font-semibold">
          Tên đăng nhập
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={64}
          autoCapitalize="none"
          spellCheck={false}
          className="w-full rounded-lg border-2 border-slate-300 px-3 py-2"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block font-semibold">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={72}
          className="w-full rounded-lg border-2 border-slate-300 px-3 py-2"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={pending}
      >
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
};
