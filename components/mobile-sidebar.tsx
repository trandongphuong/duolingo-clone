import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";

import { Sidebar } from "./sidebar";

export const MobileSidebar = () => {
  return (
    <Sheet>
      <SheetTrigger aria-label="Mở điều hướng">
        <Menu className="text-white" aria-hidden="true" />
      </SheetTrigger>

      <SheetContent className="z-[100] p-0" side="left">
        <SheetTitle className="sr-only">Điều hướng Hán ngữ biển</SheetTitle>
        <SheetDescription className="sr-only">Chọn khóa học, học, ôn tập, tiến độ hoặc tài khoản.</SheetDescription>
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
};
