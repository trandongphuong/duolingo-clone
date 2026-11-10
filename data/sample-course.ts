/** Original demonstration data. Mandarin and Vietnamese require expert review before teaching use. */
export const SAMPLE_NOTICE = "DỮ LIỆU MẪU CHƯA KIỂM DUYỆT";
export const SAMPLE_SOURCE =
  "Ngữ liệu phổ thông do dự án biên soạn để thử phần mềm; chưa được chuyên gia ngôn ngữ thẩm định. Không thay thế IMO SMCP tiếng Anh.";

export type SampleLesson = {
  code: string;
  title: string;
  description: string;
  entries: Array<readonly [hanzi: string, pinyin: string, meaningVi: string]>;
};

export const sampleLessons: SampleLesson[] = [
  {
    code: "L01",
    title: "Pinyin, bốn thanh điệu và chào hỏi",
    description:
      "Làm quen chữ và Pinyin. mā, má, mǎ, mà minh họa bốn thanh; cần giáo viên/âm thanh được kiểm duyệt để học phát âm.",
    entries: [
      ["你好", "nǐ hǎo", "Xin chào"],
      ["早上好", "zǎoshang hǎo", "Chào buổi sáng"],
      ["晚上好", "wǎnshang hǎo", "Chào buổi tối"],
      ["再见", "zàijiàn", "Tạm biệt"],
      ["汉语", "Hànyǔ", "Tiếng Hán"],
      ["拼音", "pīnyīn", "Pinyin / phiên âm"],
      ["妈", "mā", "Mẹ (thanh 1)"],
      ["麻", "má", "Cây gai (thanh 2)"],
      ["马", "mǎ", "Ngựa (thanh 3)"],
      ["骂", "mà", "Mắng (thanh 4)"],
    ],
  },
  {
    code: "L02",
    title: "Giới thiệu bản thân và phép lịch sự",
    description:
      "Tự giới thiệu và dùng lời lịch sự trong giao tiếp thường ngày.",
    entries: [
      ["我", "wǒ", "Tôi"],
      ["你", "nǐ", "Bạn / anh / chị"],
      ["我叫", "wǒ jiào", "Tôi tên là…"],
      ["很高兴认识你", "hěn gāoxìng rènshi nǐ", "Rất vui được biết bạn"],
      ["请", "qǐng", "Xin mời / làm ơn"],
      ["谢谢", "xièxie", "Cảm ơn"],
      ["不客气", "bú kèqi", "Không có gì (đáp lời cảm ơn)"],
      ["对不起", "duìbuqǐ", "Xin lỗi"],
      ["没关系", "méi guānxi", "Không sao"],
      ["请坐", "qǐng zuò", "Mời ngồi"],
    ],
  },
  {
    code: "L03",
    title: "Số đếm, ngày giờ và lịch hẹn",
    description: "Một số số đếm và cách gọi thời gian thông dụng.",
    entries: [
      ["一", "yī", "Một"],
      ["二", "èr", "Hai"],
      ["三", "sān", "Ba"],
      ["十", "shí", "Mười"],
      ["今天", "jīntiān", "Hôm nay"],
      ["明天", "míngtiān", "Ngày mai"],
      ["现在", "xiànzài", "Bây giờ"],
      ["上午", "shàngwǔ", "Buổi sáng (trước trưa)"],
      ["下午", "xiàwǔ", "Buổi chiều"],
      ["点", "diǎn", "Giờ (chỉ thời điểm)"],
    ],
  },
  {
    code: "L04",
    title: "Nghề nghiệp, sở thích và quan hệ",
    description: "Từ phổ thông về học tập, công việc và sở thích.",
    entries: [
      ["学生", "xuésheng", "Học sinh / sinh viên"],
      ["老师", "lǎoshī", "Giáo viên"],
      ["朋友", "péngyou", "Bạn bè"],
      ["同事", "tóngshì", "Đồng nghiệp"],
      ["工作", "gōngzuò", "Công việc / làm việc"],
      ["学习", "xuéxí", "Học tập"],
      ["看书", "kàn shū", "Đọc sách"],
      ["音乐", "yīnyuè", "Âm nhạc"],
      ["运动", "yùndòng", "Vận động / thể thao"],
      ["家人", "jiārén", "Người nhà"],
    ],
  },
  {
    code: "L05",
    title: "Thời tiết và các mùa",
    description:
      "Mô tả thời tiết thường gặp, không dùng làm dự báo hay chỉ dẫn an toàn.",
    entries: [
      ["天气", "tiānqì", "Thời tiết"],
      ["晴天", "qíngtiān", "Trời nắng / quang đãng"],
      ["阴天", "yīntiān", "Trời âm u"],
      ["下雨", "xià yǔ", "Mưa / trời mưa"],
      ["风", "fēng", "Gió"],
      ["冷", "lěng", "Lạnh"],
      ["热", "rè", "Nóng"],
      ["春天", "chūntiān", "Mùa xuân"],
      ["夏天", "xiàtiān", "Mùa hè"],
      ["冬天", "dōngtiān", "Mùa đông"],
    ],
  },
  {
    code: "L06",
    title: "Phương hướng và địa điểm công cộng",
    description:
      "Chỉ phương hướng và hỏi đường trong tình huống dân sự thông thường.",
    entries: [
      ["东", "dōng", "Phía đông"],
      ["南", "nán", "Phía nam"],
      ["西", "xī", "Phía tây"],
      ["北", "běi", "Phía bắc"],
      ["左边", "zuǒbian", "Bên trái"],
      ["右边", "yòubian", "Bên phải"],
      ["前面", "qiánmiàn", "Phía trước"],
      ["后面", "hòumiàn", "Phía sau"],
      ["车站", "chēzhàn", "Nhà ga / bến xe"],
      ["医院", "yīyuàn", "Bệnh viện"],
    ],
  },
  {
    code: "L07",
    title: "Biển, bờ biển và tàu thuyền",
    description:
      "Thuật ngữ công khai cơ bản; không phải quy trình vận hành hoặc liên lạc nghiệp vụ.",
    entries: [
      ["海", "hǎi", "Biển"],
      ["海岸", "hǎi'àn", "Bờ biển"],
      ["沙滩", "shātān", "Bãi cát"],
      ["船", "chuán", "Thuyền / tàu"],
      ["港口", "gǎngkǒu", "Cảng"],
      ["码头", "mǎtóu", "Bến tàu"],
      ["船员", "chuányuán", "Thuyền viên"],
      ["海水", "hǎishuǐ", "Nước biển"],
      ["岛", "dǎo", "Đảo"],
      ["桥", "qiáo", "Cầu"],
    ],
  },
  {
    code: "L08",
    title: "An toàn cá nhân và giúp đỡ dân sự",
    description:
      "Cụm từ phổ thông cần thẩm định. Không thay thế IMO SMCP tiếng Anh hay chỉ dẫn cứu hộ chính thức.",
    entries: [
      ["安全", "ānquán", "An toàn"],
      ["小心", "xiǎoxīn", "Cẩn thận"],
      ["帮忙", "bāngmáng", "Giúp đỡ"],
      ["救生衣", "jiùshēngyī", "Áo phao cứu sinh"],
      ["急救", "jíjiù", "Sơ cứu / cấp cứu"],
      ["医生", "yīshēng", "Bác sĩ"],
      ["饮用水", "yǐnyòngshuǐ", "Nước uống"],
      ["休息", "xiūxi", "Nghỉ ngơi"],
      ["我需要帮助", "wǒ xūyào bāngzhù", "Tôi cần giúp đỡ"],
      ["请打电话", "qǐng dǎ diànhuà", "Làm ơn gọi điện thoại"],
    ],
  },
  {
    code: "L09",
    title: "Giao lưu văn hóa và giới thiệu Việt Nam",
    description:
      "Từ về văn hóa, món quen và địa danh chung; không có thông tin nhân sự hay đơn vị thực tế.",
    entries: [
      ["越南", "Yuènán", "Việt Nam"],
      ["中国", "Zhōngguó", "Trung Quốc"],
      ["文化", "wénhuà", "Văn hóa"],
      ["春节", "Chūnjié", "Tết Nguyên đán"],
      ["咖啡", "kāfēi", "Cà phê"],
      ["茶", "chá", "Trà"],
      ["米饭", "mǐfàn", "Cơm"],
      ["河流", "héliú", "Sông ngòi"],
      ["城市", "chéngshì", "Thành phố"],
      ["欢迎", "huānyíng", "Chào mừng"],
    ],
  },
  {
    code: "L10",
    title: "Tiếp đón và xác nhận thông tin",
    description:
      "Mẫu câu ngắn cho giao tiếp thường ngày, không phải văn bản đối ngoại đã phê duyệt.",
    entries: [
      ["请进", "qǐng jìn", "Mời vào"],
      ["请问", "qǐngwèn", "Xin hỏi"],
      ["请稍等", "qǐng shāo děng", "Xin chờ một chút"],
      ["请再说一遍", "qǐng zài shuō yí biàn", "Xin nói lại một lần"],
      ["我明白了", "wǒ míngbai le", "Tôi đã hiểu"],
      ["我不明白", "wǒ bù míngbai", "Tôi chưa hiểu"],
      ["是的", "shì de", "Đúng vậy"],
      ["不是", "bú shì", "Không phải"],
      ["可以吗", "kěyǐ ma", "Có được không?"],
      ["没问题", "méi wèntí", "Không vấn đề gì"],
    ],
  },
];
