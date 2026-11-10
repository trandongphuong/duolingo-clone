import Link from "next/link";

const SignUpPage = () => {
  return (
    <div className="max-w-md space-y-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Tài khoản nội bộ</h1>
      <p>
        Liên hệ quản trị viên để được cấp tài khoản học Hán ngữ biển. Hệ thống
        không mở đăng ký công khai.
      </p>
      <Link href="/sign-in" className="font-bold text-sky-700 underline">
        Về trang đăng nhập
      </Link>
    </div>
  );
};

export default SignUpPage;
