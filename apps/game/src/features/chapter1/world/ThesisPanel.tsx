import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  MessageSquareText,
  Save,
  Search,
  StickyNote,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FatigueLevel, RestMode } from "../../../game/narrative/fatigue";
import type { ThesisTaskView } from "../../../game/narrative/world";
import type { ThesisFocusMode } from "../../../game/narrative/thesisSession";
import { useGameLocale } from "../../../i18n";
import { UI } from "../theme";
import { formatDuration, type DurationText } from "./formatDuration";

export type ThesisTone = "dark" | "paper";

export interface ThesisDeepWorkContext {
  state: import("../../../game/narrative/types").ChapterState;
  scenario: import("../../../game/narrative/types").ScenarioDefinition;
  baseMinutesPerPercent: number;
  fatigueConfig: import("../../../game/narrative/fatigue").FatigueConfig;
  /** Keeps the manuscript draft alive while the laptop switches between apps. */
  documentDraft?: React.MutableRefObject<{ content: Record<string, string>; savedContent: Record<string, string> }>;
  onPreviewMinutesOffset?: (offsetMinutes: number | null) => void;
  onInspectInterruption?: (appHint?: "email" | "chat" | "bank" | "phone") => void;
}

export interface ThesisPanelProps {
  tone?: ThesisTone;
  progress: number;
  sessionMinutes: number;
  sessionPercent: number;
  freeWorkMaxPercent: number;
  timeLeftMinutes: number;
  tasks: readonly ThesisTaskView[];
  onWork: (minutes: number, focusMode?: ThesisFocusMode) => void;
  onTask: (taskId: string) => void;
  /** Open Alex's laptop so planning never grants thesis progress by itself. */
  onOpenDocument?: () => void;
  fatigue?: { level: FatigueLevel; slowdownPercent: number };
  rest?: { napMinutes: number; sleepMinutes: number; onRest: (mode: RestMode) => void };
  deepWork?: ThesisDeepWorkContext;
}

type ThesisSectionId = "introduction" | "findings" | "full-draft";
type Localized = { en: string; vi: string };

interface ThesisSection {
  id: ThesisSectionId;
  taskId: string;
  heading: Localized;
  subheading: Localized;
  initialText: Localized;
  comment: Localized;
}

const SECTIONS: readonly ThesisSection[] = [
  {
    id: "introduction",
    taskId: "draft.intro-review",
    heading: { en: "1. Introduction & literature review", vi: "1. Mở đầu & tổng quan tài liệu" },
    subheading: { en: "1.2 Research context", vi: "1.2 Bối cảnh nghiên cứu" },
    initialText: {
      en: "Digital payment systems are now part of everyday student life in Ho Chi Minh City. This study examines how graduating international students decide whether an online request is legitimate when administrative deadlines create pressure.\n\nResearch on phishing has often focused on technical indicators such as suspicious links and sender addresses. Less attention has been paid to how uncertainty about university procedures shapes the way students respond. This study addresses that gap through semi-structured interviews with graduating students in the city.\n\nThe study asks how students verify unexpected requests for money or account information, and what makes that verification easier or harder.",
      vi: "Thanh toán số đã trở thành một phần trong đời sống hằng ngày của sinh viên tại Thành phố Hồ Chí Minh. Nghiên cứu này tìm hiểu cách sinh viên quốc tế sắp tốt nghiệp xác định một yêu cầu trực tuyến có đáng tin hay không khi áp lực thời hạn hành chính xuất hiện.\n\nCác nghiên cứu về lừa đảo trực tuyến thường tập trung vào dấu hiệu kỹ thuật như đường dẫn đáng ngờ và địa chỉ người gửi. Ít nghiên cứu chú ý đến việc sự không rõ ràng trong quy trình của trường ảnh hưởng thế nào đến cách sinh viên phản hồi. Nghiên cứu này tìm hiểu khoảng trống đó qua các cuộc phỏng vấn bán cấu trúc với sinh viên sắp tốt nghiệp tại thành phố.\n\nNghiên cứu đặt câu hỏi sinh viên xác minh các yêu cầu bất ngờ về tiền hoặc thông tin tài khoản ra sao, và điều gì khiến việc xác minh dễ hoặc khó hơn.",
    },
    comment: {
      en: "The context is clear. Tighten the gap in paragraph two: explain what existing studies do not tell us about the moment a student is under deadline pressure. Keep the research question aligned with the interview material.",
      vi: "Bối cảnh đã rõ. Hãy làm rõ khoảng trống ở đoạn hai: những nghiên cứu hiện có chưa cho ta biết điều gì về khoảnh khắc sinh viên chịu áp lực thời hạn? Giữ câu hỏi nghiên cứu bám sát tư liệu phỏng vấn.",
    },
  },
  {
    id: "findings",
    taskId: "draft.findings",
    heading: { en: "3. Findings", vi: "3. Kết quả nghiên cứu" },
    subheading: { en: "3.1 How students verify a request", vi: "3.1 Cách sinh viên xác minh yêu cầu" },
    initialText: {
      en: "Across the interviews, students described checking an unexpected request against a channel they already knew, such as a saved university portal or a previously used phone number. Some said they would ask a classmate first when they were unsure which office to contact.\n\n[Reconcile this paragraph with the interview coding sheet before sending the draft. Do not turn a small interview sample into a claim about all students.]\n\nThe accounts suggest that verification is not a single technical check. Students weigh the time it takes to contact someone against the possibility of missing a deadline.",
      vi: "Trong các cuộc phỏng vấn, sinh viên kể rằng họ đối chiếu yêu cầu bất ngờ với một kênh đã biết, chẳng hạn cổng thông tin trường đã lưu hoặc số điện thoại từng sử dụng. Một số bạn cho biết sẽ hỏi bạn cùng lớp trước khi biết nên liên hệ phòng ban nào.\n\n[Đối chiếu đoạn này với bảng mã hóa phỏng vấn trước khi gửi bản thảo. Không khái quát từ một mẫu phỏng vấn nhỏ thành kết luận về tất cả sinh viên.]\n\nNhững chia sẻ cho thấy xác minh không chỉ là một bước kiểm tra kỹ thuật. Sinh viên cân nhắc thời gian cần để liên hệ người khác với nguy cơ bỏ lỡ thời hạn.",
    },
    comment: {
      en: "Please separate what participants actually said from your interpretation. Check the coded interview notes beside this document; keep the sample size visible and avoid claims beyond it.",
      vi: "Hãy tách lời người tham gia thực sự nói khỏi phần diễn giải của em. Đối chiếu ghi chú phỏng vấn đã mã hóa ở cạnh tài liệu; nêu rõ quy mô mẫu và tránh kết luận vượt quá dữ liệu.",
    },
  },
  {
    id: "full-draft",
    taskId: "draft.final",
    heading: { en: "Full draft · final read-through", vi: "Toàn văn · đọc soát lần cuối" },
    subheading: { en: "Before sending to your supervisor", vi: "Trước khi gửi giảng viên hướng dẫn" },
    initialText: {
      en: "The interviews suggest that students' responses to unexpected online requests are shaped by both their digital habits and their understanding of university procedures. When the correct contact point is easy to find, students can pause to verify a request without feeling that they are risking a deadline.\n\nThis study is limited by its small, locally recruited sample. The findings describe these participants' accounts and should not be generalized to all international students. Further research could compare students across institutions and examine how clearer administrative communication changes verification behavior.\n\n[Read the full document once. Check that the research question, findings and limitations use the same terms.]",      vi: "Các cuộc phỏng vấn cho thấy phản ứng của sinh viên trước yêu cầu trực tuyến bất ngờ chịu ảnh hưởng từ cả thói quen số lẫn hiểu biết về quy trình của trường. Khi dễ tìm đúng nơi liên hệ, sinh viên có thể dừng lại để xác minh mà không cảm thấy mình đang mạo hiểm bỏ lỡ thời hạn.\n\nNghiên cứu bị giới hạn bởi mẫu nhỏ được tuyển tại địa phương. Kết quả mô tả chia sẻ của những người tham gia này và không nên khái quát cho toàn bộ sinh viên quốc tế. Các nghiên cứu tiếp theo có thể so sánh sinh viên giữa các trường và xem xét cách truyền đạt hành chính rõ ràng hơn tác động đến hành vi xác minh.\n\n[Đọc lại toàn văn một lượt. Kiểm tra câu hỏi nghiên cứu, kết quả và phần giới hạn có dùng thuật ngữ nhất quán không.]",
    },
    comment: {
      en: "One last pass: make sure the conclusion does not claim more than the interviews support. Then save the version you would actually send me.",
      vi: "Đọc lại lần cuối: đảm bảo kết luận không nói quá những gì phỏng vấn hỗ trợ. Sau đó lưu phiên bản em thực sự muốn gửi cho tôi.",
    },
  },
];

const RESEARCH_NOTES: Localized[] = [
  { en: "Interview coding sheet · 24 graduating students · Ho Chi Minh City", vi: "Bảng mã hóa phỏng vấn · 24 sinh viên sắp tốt nghiệp · TP. Hồ Chí Minh" },
  { en: "9 participants described checking a saved portal or a contact they had used before.", vi: "9 người tham gia kể rằng họ kiểm tra cổng thông tin đã lưu hoặc liên hệ từng sử dụng." },
  { en: "6 participants said they asked a classmate when they could not identify the right office.", vi: "6 người tham gia cho biết họ hỏi bạn cùng lớp khi không biết nên liên hệ phòng ban nào." },
  { en: "Working note: these are interview counts, not estimates for the wider student population.", vi: "Ghi chú: đây là số đếm trong phỏng vấn, không phải ước tính cho toàn bộ sinh viên." },
];

function meaningfulChange(before: string, after: string): boolean {
  if (before === after) return false;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return Math.max(beforeEnd - start, afterEnd - start) >= 18;
}

function insertAtSelection(value: string, insertion: string, textarea: HTMLTextAreaElement | null) {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? start;
  const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
  return { value: nextValue, cursor: start + insertion.length };
}

/** A small, diegetic word processor: the player revises Alex's actual manuscript, not a typing game. */
export const ThesisPanel: React.FC<ThesisPanelProps> = ({
  tone = "dark", progress, sessionMinutes, freeWorkMaxPercent, timeLeftMinutes,
  tasks, onTask, onOpenDocument, fatigue, rest, deepWork,
}) => {
  const { t } = useTranslation("chapter1");
  const isVi = useGameLocale() === "vi";
  const text = t as unknown as DurationText;
  const [sectionId, setSectionId] = useState<ThesisSectionId>("introduction");
  const [content, setContent] = useState<Record<ThesisSectionId, string>>(() => Object.fromEntries(
    SECTIONS.map((section) => [section.id, deepWork?.documentDraft?.current.content[section.id] ?? section.initialText[isVi ? "vi" : "en"]]),
  ) as Record<ThesisSectionId, string>);
  const [savedContent, setSavedContent] = useState<Record<ThesisSectionId, string>>(() => Object.fromEntries(
    SECTIONS.map((section) => [section.id, deepWork?.documentDraft?.current.savedContent[section.id] ?? section.initialText[isVi ? "vi" : "en"]]),
  ) as Record<ThesisSectionId, string>);
  const [saveMessage, setSaveMessage] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const activeSection = SECTIONS.find((section) => section.id === sectionId) ?? SECTIONS[0];
  const activeTask = tasks.find((task) => task.id === activeSection.taskId);
  const currentText = content[sectionId];
  const hasChanges = savedContent[sectionId] !== currentText;
  const substantiveRevision = meaningfulChange(savedContent[sectionId], currentText);
  const canCompleteTask = Boolean(activeTask && !activeTask.done && activeTask.blocked === null);
  const isLocked = Boolean(activeTask && !activeTask.done && activeTask.blocked === "locked");
  const words = useMemo(() => currentText.trim().split(/\s+/).filter(Boolean).length, [currentText]);
  const totalWords = Object.values(content).join(" ").trim().split(/\s+/).filter(Boolean).length;
  const atLimit = progress >= freeWorkMaxPercent;
  const timeUp = timeLeftMinutes <= 0;

  const updateText = useCallback((next: string) => {
    setContent((previous) => ({ ...previous, [sectionId]: next }));
    if (deepWork?.documentDraft) deepWork.documentDraft.current.content[sectionId] = next;
    setSaveMessage("");
  }, [deepWork?.documentDraft, sectionId]);

  const saveDocument = useCallback(() => {
    if (!hasChanges || timeUp || activeTask?.blocked === "time" || activeTask?.blocked === "complete") return;
    setSavedContent((previous) => ({ ...previous, [sectionId]: currentText }));
    if (deepWork?.documentDraft) deepWork.documentDraft.current.savedContent[sectionId] = currentText;
    setSaveMessage(isVi ? "Đã lưu vào thesis-draft.docx" : "Saved to thesis-draft.docx");
    if (canCompleteTask && substantiveRevision && activeTask) onTask(activeTask.id);
  }, [activeTask, canCompleteTask, currentText, deepWork?.documentDraft, hasChanges, isVi, onTask, sectionId, substantiveRevision, timeUp]);

  const insertNote = useCallback((note: string) => {
    const inserted = insertAtSelection(currentText, note, editorRef.current);
    updateText(inserted.value);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }, [currentText, updateText]);

  const findNext = useCallback(() => {
    const editor = editorRef.current;
    const needle = findQuery.trim();
    if (!editor || !needle) return;
    const start = editor.selectionEnd;
    const lower = currentText.toLocaleLowerCase();
    const foundAt = lower.indexOf(needle.toLocaleLowerCase(), start);
    const index = foundAt >= 0 ? foundAt : lower.indexOf(needle.toLocaleLowerCase());
    if (index >= 0) {
      editor.focus();
      editor.setSelectionRange(index, index + needle.length);
    }
  }, [currentText, findQuery]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDocument();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveDocument]);

  // The schedule overlay remains a compact planning surface; actual document revisions happen in the laptop's paper-tone editor.
  if (!deepWork || tone === "dark") {
    return (
      <section aria-labelledby="thesis-panel-heading" data-testid="thesis-panel" className={tone === "dark" ? UI.card : ""}>
        <h3 id="thesis-panel-heading" className={tone === "dark" ? UI.label : "text-sm font-semibold text-slate-700"}>{t("planner.thesis.heading")}</h3>
        <p className="mt-2 text-sm" data-testid="thesis-progress">{t("planner.thesis.progress", { value: progress })}</p>
        <p className="mt-1 text-xs text-slate-500" data-testid="thesis-limit">{t("planner.thesis.limit")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("planner.thesis.session", { time: formatDuration(text, sessionMinutes) })}</p>
        <p className="mt-2 text-xs">{isVi ? "Mở bản thảo trên laptop để đọc nhận xét và chỉnh sửa nội dung." : "Open the draft on your laptop to review comments and revise the document."}</p>
        {onOpenDocument && <button type="button" className={`${UI.buttonPrimary} mt-3`} data-testid="thesis-open-document" onClick={() => onOpenDocument()}>{isVi ? "Mở bản thảo" : "Open thesis draft"}</button>}
        {fatigue && fatigue.level !== "rested" && <p className="mt-2 text-xs" data-testid="thesis-fatigue">{t(`planner.thesis.fatigueNote.${fatigue.level}`, { percent: fatigue.slowdownPercent })}</p>}
        {rest && <div className="mt-3 flex gap-2" data-testid="rest-panel"><button type="button" data-testid="rest-nap" disabled={timeUp} onClick={() => rest.onRest("nap")}>{t("planner.thesis.nap", { time: formatDuration(text, rest.napMinutes) })}</button><button type="button" data-testid="rest-sleep" disabled={timeUp} onClick={() => rest.onRest("sleep")}>{t("planner.thesis.sleep", { time: formatDuration(text, rest.sleepMinutes) })}</button></div>}
      </section>
    );
  }

  const completedSections = tasks.filter((task) => task.done).length;
  const pageTone = tone === "paper" ? "bg-[#f8fafc] text-[#253247]" : "bg-[#111b2b] text-slate-100";
  const mutedTone = tone === "paper" ? "text-slate-500" : "text-slate-400";
  const borderTone = tone === "paper" ? "border-slate-200" : "border-white/10";
  const translate = (value: Localized) => value[isVi ? "vi" : "en"];

  return (
    <section aria-labelledby="thesis-panel-heading" data-testid="thesis-panel" className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg ${pageTone}`}>
      <div className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 ${borderTone} bg-white/70 text-slate-700`}>
        <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-blue-700" /><h3 id="thesis-panel-heading" className="truncate text-xs font-semibold" data-testid="thesis-progress">thesis-draft.docx</h3><span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">{isVi ? "Lưu trên máy" : "On this device"}</span></div>
        <div className="flex shrink-0 items-center gap-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />{saveMessage || (hasChanges ? (isVi ? "Chưa lưu thay đổi" : "Unsaved changes") : (isVi ? "Đã lưu" : "Saved"))}</span><span className="hidden sm:inline">{isVi ? `Bản thảo ${Math.round(progress)}%` : `Draft ${Math.round(progress)}%`}</span></div>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-[#f1f4f9] px-3 py-1.5 text-[10px] text-slate-600">
        {[isVi ? "Tệp" : "File", isVi ? "Trang đầu" : "Home", isVi ? "Chèn" : "Insert", isVi ? "Xem lại" : "Review"].map((label, index) => <span key={label} className={`rounded px-2 py-1 ${index === 1 ? "bg-white font-semibold text-blue-800 shadow-sm" : ""}`}>{label}</span>)}
        <div className="ml-auto flex items-center gap-1.5"><span className="h-4 border-l border-slate-300" />
          <div className="flex h-7 items-center gap-1 rounded-md border border-[#d9e0eb] bg-white px-1.5"><Search className="h-3 w-3 text-slate-400" /><input aria-label={isVi ? "Tìm trong tài liệu" : "Find in document"} value={findQuery} onChange={(event) => setFindQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") findNext(); }} placeholder={isVi ? "Tìm" : "Find"} className="w-16 bg-transparent text-[10px] text-slate-700 outline-none" /><button type="button" onClick={findNext} className="text-[10px] font-medium text-blue-700">↵</button></div>
          <button type="button" data-testid="thesis-save" onClick={saveDocument} disabled={!hasChanges || timeUp || activeTask?.blocked === "time" || activeTask?.blocked === "complete"} className="flex h-7 items-center gap-1.5 rounded-md bg-[#315aa8] px-2.5 text-[10px] font-semibold text-white hover:bg-[#274b91] disabled:cursor-not-allowed disabled:bg-slate-300"><Save className="h-3 w-3" />{isVi ? "Lưu" : "Save"}</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[148px_minmax(320px,1fr)] lg:grid-cols-[148px_minmax(320px,1fr)_210px]">
        <aside className={`hidden overflow-y-auto border-r p-2.5 md:block ${borderTone}`}>
          <div className={`mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide ${mutedTone}`}><BookOpen className="h-3 w-3" />{isVi ? "Điều hướng" : "Navigation"}</div>
          <div className="space-y-0.5">{SECTIONS.map((section, index) => {
            const task = tasks.find((item) => item.id === section.taskId);
            const selected = section.id === sectionId;
            return <button key={section.id} type="button" onClick={() => { setSectionId(section.id); setSaveMessage(""); }} className={`flex w-full items-start gap-1.5 rounded-md px-2 py-2 text-left text-[10px] leading-snug ${selected ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:bg-white/70"}`}>
              {task?.done ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> : <span className="mt-0.5 w-3 shrink-0 text-center text-slate-400">{index + 1}</span>}<span>{translate(section.heading)}</span>
            </button>;
          })}</div>
          <div className={`mt-4 border-t pt-3 ${borderTone}`}><div className={`mb-1.5 text-[9px] font-semibold uppercase tracking-wide ${mutedTone}`}>{isVi ? "Tiến độ bản thảo" : "Draft status"}</div><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${Math.min(100, progress)}%` }} /></div><p className="mt-1 text-[9px] text-slate-500">{Math.round(progress)}% · {completedSections}/3 {isVi ? "phần đã lưu" : "sections saved"}</p></div>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-[#e8edf4] p-3 sm:p-5" onWheel={(event) => event.stopPropagation()}>
          <div className="mx-auto min-h-full max-w-[680px] bg-white px-7 py-6 shadow-[0_2px_12px_rgba(33,47,67,0.12)] sm:px-12 sm:py-8">
            <div className="mb-7 border-b border-slate-200 pb-4 text-center"><p className="text-[9px] uppercase tracking-[0.22em] text-slate-400">{isVi ? "Khóa luận tốt nghiệp" : "Undergraduate thesis"}</p><p className="mt-1 font-serif text-sm font-semibold text-slate-800">{isVi ? "Xác minh yêu cầu trực tuyến trong đời sống sinh viên" : "Verifying online requests in student life"}</p><p className="mt-1 text-[9px] text-slate-400">Alex · {isVi ? "Bản thảo chương 3" : "Chapter 3 draft"} · {isVi ? "Thứ Ba, 17:00" : "Tuesday, 17:00"}</p></div>
            <h4 className="font-serif text-[17px] font-semibold text-slate-800">{translate(activeSection.heading)}</h4><p className="mt-1 font-serif text-[12px] font-semibold text-slate-700">{translate(activeSection.subheading)}</p>
            {sectionId === "full-draft" && <div className="mt-3 space-y-3 border-b border-slate-200 pb-4 font-serif text-[11px] leading-relaxed text-slate-600">
              <section><h5 className="mb-1 font-sans text-[9px] font-semibold uppercase tracking-wide text-slate-400">{translate(SECTIONS[0].heading)}</h5><p className="whitespace-pre-wrap">{content.introduction}</p></section>
              <section><h5 className="mb-1 font-sans text-[9px] font-semibold uppercase tracking-wide text-slate-400">{translate(SECTIONS[1].heading)}</h5><p className="whitespace-pre-wrap">{content.findings}</p></section>
              <h5 className="font-sans text-[10px] font-semibold text-slate-700">{isVi ? "Kết luận & giới hạn nghiên cứu — chỉnh sửa bên dưới" : "Conclusion & limitations — revise below"}</h5>
            </div>}
            <textarea ref={editorRef} aria-label={isVi ? `Chỉnh sửa ${activeSection.heading.vi}` : `Edit ${activeSection.heading.en}`} data-testid="thesis-document-editor" value={currentText} onChange={(event) => updateText(event.target.value)} spellCheck className="mt-3 min-h-[250px] w-full resize-y border-0 bg-transparent p-0 font-serif text-[12px] leading-[1.85] text-slate-700 outline-none focus:ring-0 sm:min-h-[310px]" />
            <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-100 pt-2 text-[9px] text-slate-400"><span>{isVi ? `${words} từ trong phần này` : `${words} words in this section`}</span><span>{isVi ? "Trang 12 · APA 7" : "Page 12 · APA 7"}</span></div>
            {isLocked && <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-900">{isVi ? "Phần này sẽ sẵn sàng sau khi các phần trước được lưu. Em vẫn có thể chỉnh sửa bản nháp." : "This section becomes part of the submission after the earlier sections are saved. You can still edit the draft."}</p>}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3"><p className="text-[9px] text-slate-400">{hasChanges ? (isVi ? "Có thay đổi chưa lưu" : "Changes not yet saved") : (isVi ? "Tài liệu đã đồng bộ trên máy" : "Document is saved on this device")}</p>
              {canCompleteTask && <button type="button" data-testid={`thesis-task-${activeSection.taskId}`} onClick={saveDocument} disabled={!hasChanges || timeUp} className="inline-flex items-center gap-1 rounded-md bg-[#315aa8] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-[#274b91] disabled:cursor-not-allowed disabled:bg-slate-300">{isVi ? "Lưu bản sửa" : "Save revision"}<ChevronRight className="h-3 w-3" /></button>}
            </div>
          </div>
        </main>

        <aside className={`hidden overflow-y-auto border-l bg-white/55 p-2.5 lg:block ${borderTone}`}>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600"><MessageSquareText className="h-3.5 w-3.5 text-blue-700" />{isVi ? "Nhận xét" : "Comments"}</div>
          <div data-testid="thesis-supervisor-comment" className="rounded-md border border-blue-100 bg-blue-50/70 p-2.5"><div className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#dce7ff] text-[9px] font-bold text-blue-800">N</span><span className="text-[9px] font-semibold text-slate-700">{isVi ? "TS. Nguyễn · Giảng viên hướng dẫn" : "Dr. Nguyen · Supervisor"}</span></div><p className="mt-2 text-[10px] leading-relaxed text-slate-600">{translate(activeSection.comment)}</p><p className="mt-2 text-[9px] text-slate-400">{isVi ? "Hôm nay, 14:20" : "Today, 14:20"}</p></div>
          <div className="mt-4 border-t border-slate-200 pt-3"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600"><StickyNote className="h-3.5 w-3.5 text-amber-700" />{isVi ? "Ghi chú phỏng vấn" : "Interview notes"}</div><div className="space-y-1.5" data-testid="thesis-research-notes">{RESEARCH_NOTES.map((note, index) => <div key={note.en} className={`rounded-md p-2 text-[9px] leading-relaxed ${index === 0 ? "bg-amber-50 font-medium text-amber-950" : "bg-slate-50 text-slate-600"}`}><p>{translate(note)}</p>{index > 0 && <button type="button" onClick={() => insertNote(translate(note))} className="mt-1 text-[9px] font-semibold text-blue-700 hover:underline">{isVi ? "Chèn vào bản thảo" : "Insert into draft"}</button>}</div>)}</div></div>
          <div className="mt-4 border-t border-slate-200 pt-2 text-[9px] leading-relaxed text-slate-500"><div className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{isVi ? `Còn ${Math.floor(timeLeftMinutes / 60)} giờ ${timeLeftMinutes % 60} phút` : `${Math.floor(timeLeftMinutes / 60)}h ${timeLeftMinutes % 60}m remaining`}</div>{fatigue && fatigue.level !== "rested" && <p className="mt-1" data-testid="thesis-fatigue">{t(`planner.thesis.fatigueNote.${fatigue.level}`, { percent: fatigue.slowdownPercent })}</p>}{atLimit && <p className="mt-1">{isVi ? "Tiến độ viết tự do đã đến giới hạn; các phần cần sửa vẫn có thể lưu." : "Free-writing progress is at its limit; required revisions can still be saved."}</p>}</div>
        </aside>
      </div>

      {rest && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-3 py-1.5" data-testid="rest-panel"><span className="mr-auto text-[9px] text-slate-500">{isVi ? `${totalWords.toLocaleString()} từ trong bản thảo` : `${totalWords.toLocaleString()} words in draft`}</span><button type="button" data-testid="rest-nap" disabled={timeUp} onClick={() => rest.onRest("nap")} className="rounded border border-slate-200 px-2 py-1 text-[9px] text-slate-600 disabled:opacity-40">{t("planner.thesis.nap", { time: formatDuration(text, rest.napMinutes) })}</button><button type="button" data-testid="rest-sleep" disabled={timeUp} onClick={() => rest.onRest("sleep")} className="rounded border border-slate-200 px-2 py-1 text-[9px] text-slate-600 disabled:opacity-40">{t("planner.thesis.sleep", { time: formatDuration(text, rest.sleepMinutes) })}</button></div>}
    </section>
  );
};
