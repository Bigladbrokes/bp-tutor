import React, { useMemo, useState } from "react";
import KaTeXRenderer from "./KaTeXRenderer";
import DrawingTool from "./DrawingTool";
import { deleteQuestionImage } from "../services/storageService";
import { normalizeChapter, chaptersFor } from "../services/chapters";

const GRADES       = ["M.1", "M.2", "M.3"];
const SUBJECTS     = ["Math", "Science"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

const DIFF_SELECT_STYLE = {
  Easy:   { background: "#e8f5e9", color: "#2e7d32", borderColor: "#a5d6a7" },
  Medium: { background: "#fff8e1", color: "#e65100", borderColor: "#ffe082" },
  Hard:   { background: "#fce4ec", color: "#c62828", borderColor: "#f48fb1" },
  "":     {},
};

const toFormState = (data) => ({
  text:          data?.text        || "",
  type:          data?.type        || "mc",
  options:       data?.options     || ["", "", "", ""],
  correctAnswer: data?.type === "fill_in_blank" ? "" : (data?.correctAnswer || "0"),
  hint:          data?.hint        || "",
  steps:         data?.steps       || [],
  imageUrl:      data?.imageUrl    || "",
  imagePath:     data?.imagePath   || "",
  imageDataUrl:  data?.imageDataUrl || "",
  drawingShapes: data?.drawingShapes || [],
  grade:         data?.grade       || "M.1",
  subject:       data?.subject     || "Science",
  difficulty:    data?.difficulty  || "Easy",
  chapter:       data?.chapter     || "",
  // blanks: migrate old single-answer FitB format to array
  blanks: data?.blanks ||
    (data?.type === "fill_in_blank" && data?.correctAnswer
      ? [{ id: 1, answer: data.correctAnswer, hint: data.hint || "" }]
      : [{ id: 1, answer: "", hint: "" }]),
});

export default function QuestionForm({ onSave, onClose, initialData, questions = [] }) {
  const isEdit = !!initialData;
  const [form, setForm] = useState(() => toFormState(initialData));
  const [saving, setSaving] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);

  // Existing chapters for THIS question's grade + subject — the autocomplete
  // pool. Derived from the questions already loaded by the teacher page.
  const chapterSuggestions = useMemo(
    () => chaptersFor(questions, form.grade, form.subject),
    [questions, form.grade, form.subject]
  );
  const needsChapterBackfill = isEdit && !normalizeChapter(initialData?.chapter);

  const handleRemoveImage = async () => {
    if (form.imagePath) await deleteQuestionImage(form.imagePath);
    setForm((f) => ({ ...f, imageUrl: "", imagePath: "", imageDataUrl: "", drawingShapes: [] }));
  };

  const handleDrawingInsert = async (url, path, dataUrl, shapes) => {
    if (form.imagePath) await deleteQuestionImage(form.imagePath);
    // Keep the vector shapes so Edit Drawing can restore them later without
    // re-downloading the PNG; dataUrl is a same-session cache for the preview
    setForm((f) => ({
      ...f,
      imageUrl: url,
      imagePath: path,
      imageDataUrl: dataUrl || "",
      drawingShapes: shapes || [],
    }));
    setShowDrawing(false);
  };

  const setOption = (i, value) => {
    const opts = [...form.options];
    opts[i] = value;
    setForm({ ...form, options: opts });
  };

  const addStep = () =>
    setForm((f) => ({
      ...f,
      steps: [
        ...f.steps,
        { id: `s${Date.now()}`, instruction: "", correctAnswer: "", hint: "", tolerance: 0.01 },
      ],
    }));

  const updateStep = (i, updated) =>
    setForm((f) => {
      const steps = [...f.steps];
      steps[i] = updated;
      return { ...f, steps };
    });

  const deleteStep = (i) =>
    setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));

  const moveStep = (i, dir) =>
    setForm((f) => {
      const steps = [...f.steps];
      const j = i + dir;
      if (j < 0 || j >= steps.length) return f;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...f, steps };
    });

  const addBlank = () =>
    setForm((f) => {
      const nextId = f.blanks.length > 0 ? Math.max(...f.blanks.map(b => b.id)) + 1 : 1;
      return { ...f, blanks: [...f.blanks, { id: nextId, answer: "", hint: "" }] };
    });

  const updateBlank = (i, updated) =>
    setForm((f) => {
      const blanks = [...f.blanks];
      blanks[i] = updated;
      return { ...f, blanks };
    });

  const deleteBlank = (i) =>
    setForm((f) => ({ ...f, blanks: f.blanks.filter((_, idx) => idx !== i) }));

  const moveBlank = (i, dir) =>
    setForm((f) => {
      const blanks = [...f.blanks];
      const j = i + dir;
      if (j < 0 || j >= blanks.length) return f;
      [blanks[i], blanks[j]] = [blanks[j], blanks[i]];
      return { ...f, blanks };
    });

  const invalid =
    !form.text.trim() || !form.grade || !form.subject || !form.difficulty ||
    !normalizeChapter(form.chapter) ||
    (form.type === "mc" && form.options.some((o) => !o.trim())) ||
    (form.type === "fill_in_blank" && (form.blanks.length === 0 || form.blanks.some((b) => !b.answer.trim())));

  const handleSave = async () => {
    if (invalid) return;
    setSaving(true);
    // Save both field names so both teacher and student code can find the type
    // eslint-disable-next-line no-unused-vars
    const { imageDataUrl: _drop, ...formToSave } = form;
    try {
      await onSave({ ...formToSave, chapter: normalizeChapter(form.chapter), questionType: form.type });
      onClose();
    } catch (err) {
      console.error("Failed to save question:", err);
      alert("The question could not be saved — please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div style={s.overlay}>
      <div style={s.modal}>

        <div style={s.header}>
          <h2 style={s.title}>{isEdit ? "Edit Question" : "New Question"}</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <div style={s.body}>

          {/* ── Question text ── */}
          <div>
            <label style={s.label}>Question text — use $...$ for inline math, $$...$$ for display</label>
            {form.type === "fill_in_blank" && (
              <p style={s.fitbNote}>Use <strong>[1]</strong>, <strong>[2]</strong>, <strong>[3]</strong>... in your text to mark where blanks appear. Students will see input boxes in those positions.</p>
            )}
            <textarea
              style={s.textarea}
              rows={4}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="e.g. A block of mass $m = 2$ kg accelerates at $a = 3$ m/s². Find the net force."
            />
            {form.text.trim() && (
              <div style={s.preview}>
                <span style={s.previewLabel}>Preview </span>
                <KaTeXRenderer text={form.text} />
              </div>
            )}
          </div>

          {/* ── Metadata ── */}
          <div style={s.metaRow}>
            <div style={s.metaField}>
              <label style={s.label}>Grade <span style={s.required}>*</span></label>
              <select style={s.select} value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
                <option value="">— select —</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={s.metaField}>
              <label style={s.label}>Subject <span style={s.required}>*</span></label>
              <select style={s.select} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
                <option value="">— select —</option>
                {SUBJECTS.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
            <div style={s.metaField}>
              <label style={s.label}>Difficulty <span style={s.required}>*</span></label>
              <select
                style={{ ...s.select, ...DIFF_SELECT_STYLE[form.difficulty] }}
                value={form.difficulty}
                onChange={e => setForm({ ...form, difficulty: e.target.value })}
              >
                <option value="">— select —</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* ── Chapter / Topic ── */}
          <div>
            <label style={s.label}>Chapter / Topic <span style={s.required}>*</span></label>
            {needsChapterBackfill && (
              <p style={s.chapterNote}>
                This question has no chapter yet — add one so it's included in chapter progress tracking.
              </p>
            )}
            <input
              style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
              list="chapter-suggestions"
              value={form.chapter}
              onChange={(e) => setForm({ ...form, chapter: e.target.value })}
              onBlur={() => setForm((f) => ({ ...f, chapter: normalizeChapter(f.chapter) }))}
              placeholder={chapterSuggestions.length > 0
                ? `e.g. ${chapterSuggestions[0]} — pick an existing chapter or type a new one`
                : "e.g. ทฤษฎีบทพีทาโกรัส"}
            />
            <datalist id="chapter-suggestions">
              {chapterSuggestions.map((c) => <option key={c} value={c} />)}
            </datalist>
            <p style={s.chapterHint}>
              Suggestions show chapters that already exist for {form.grade} {form.subject}. Spacing is normalized on save.
            </p>
          </div>

          {/* ── Drawing / image ── */}
          <div>
            <label style={s.label}>Image (optional)</label>
            {form.imageUrl ? (
              <div style={s.imgPreviewBox}>
                <img src={form.imageUrl} alt="Question" style={s.imgPreview} />
                <div style={s.imgBtnRow}>
                  <button onClick={() => setShowDrawing(true)} style={s.replaceBtn}>✏ Edit Drawing</button>
                  <button onClick={handleRemoveImage} style={s.removeBtn}>✕ Remove</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowDrawing(true)} style={s.uploadBtn}>
                + Draw Shape
              </button>
            )}
          </div>

          {/* ── Question type ── */}
          <div>
            <label style={s.label}>Question type</label>
            <div style={s.radioGroup}>
              {[["mc", "Multiple Choice"], ["fill_in_blank", "Fill in the Blank"], ["sa", "Short Answer"]].map(([val, label]) => (
                <label key={val} style={s.radio}>
                  <input
                    type="radio"
                    value={val}
                    checked={form.type === val}
                    onChange={() => setForm({ ...form, type: val, correctAnswer: val === "mc" ? "0" : "" })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* ── Guided-mode hint ── */}
          <div>
            <label style={s.label}>Hint for guided mode (optional)</label>
            <input
              style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
              value={form.hint}
              onChange={(e) => setForm({ ...form, hint: e.target.value })}
              placeholder="e.g. Use F = ma, where m is mass and a is acceleration"
            />
          </div>

          {/* ── Fill in the Blank: blanks editor ── */}
          {form.type === "fill_in_blank" && (
            <div style={s.blanksSection}>
              <div style={s.blanksHeader}>
                <label style={{ ...s.label, margin: 0 }}>Blanks &amp; Answers <span style={s.required}>*</span></label>
                <button onClick={addBlank} style={s.addBlankBtn}>+ Add Blank</button>
              </div>
              {form.blanks.length === 0 && (
                <p style={s.blanksEmpty}>No blanks yet. Click "+ Add Blank" to add one.</p>
              )}
              {form.blanks.map((blank, i) => (
                <BlankEditor
                  key={blank.id}
                  blank={blank}
                  index={i}
                  total={form.blanks.length}
                  onChange={(updated) => updateBlank(i, updated)}
                  onDelete={() => deleteBlank(i)}
                  onMoveUp={() => moveBlank(i, -1)}
                  onMoveDown={() => moveBlank(i, 1)}
                />
              ))}
            </div>
          )}

          {/* ── MC options ── */}
          {form.type === "mc" && (
            <div>
              <label style={s.label}>Options — mark the correct answer</label>
              {form.options.map((opt, i) => (
                <div key={i} style={s.optionRow}>
                  <span style={s.letter}>{String.fromCharCode(65 + i)}</span>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                  <label style={s.correctLabel}>
                    <input
                      type="radio"
                      name="correct"
                      checked={form.correctAnswer === String(i)}
                      onChange={() => setForm({ ...form, correctAnswer: String(i) })}
                    />
                    Correct
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* ── Solution Steps ── */}
          <div style={s.stepsSection}>
            <div style={s.stepsHeader}>
              <label style={{ ...s.label, margin: 0 }}>
                Solution Steps — shown after guided mode
              </label>
              <button onClick={addStep} style={s.addStepBtn}>+ Add Step</button>
            </div>

            {form.steps.length === 0 && (
              <p style={s.stepsEmpty}>
                No steps added. Students will type a free-form answer in independent mode.
              </p>
            )}

            {form.steps.map((step, i) => (
              <StepEditor
                key={step.id}
                step={step}
                index={i}
                total={form.steps.length}
                onChange={(updated) => updateStep(i, updated)}
                onDelete={() => deleteStep(i)}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)}
              />
            ))}
          </div>

        </div>

        <div style={s.footer}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || invalid}
            style={{ ...s.saveBtn, opacity: saving || invalid ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Save Question"}
          </button>
        </div>

      </div>
    </div>

    {showDrawing && (
      <DrawingTool
        onInsert={handleDrawingInsert}
        onClose={() => setShowDrawing(false)}
        initialShapes={form.drawingShapes}
        backgroundUrl={form.imageDataUrl || form.imageUrl || null}
      />
    )}
    </>
  );
}

// ─── Step Editor ─────────────────────────────────────────────────────────────

function StepEditor({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div style={se.card}>
      <div style={se.header}>
        <span style={se.stepLabel}>Step {index + 1}</span>
        <div style={se.controls}>
          <button onClick={onMoveUp}  disabled={index === 0}          style={se.ctrlBtn} title="Move up">↑</button>
          <button onClick={onMoveDown} disabled={index === total - 1} style={se.ctrlBtn} title="Move down">↓</button>
          <button onClick={onDelete}                                   style={{ ...se.ctrlBtn, color: "#c62828" }} title="Delete">✕</button>
        </div>
      </div>

      <label style={se.label}>Instruction (supports LaTeX)</label>
      <textarea
        style={se.textarea}
        rows={2}
        value={step.instruction}
        onChange={(e) => onChange({ ...step, instruction: e.target.value })}
        placeholder='e.g. Rearrange $F = ma$ to solve for $a$'
      />
      {step.instruction.trim() && (
        <div style={se.preview}>
          <KaTeXRenderer text={step.instruction} />
        </div>
      )}

      <label style={se.label}>Expected answer</label>
      <input
        style={se.input}
        value={step.correctAnswer}
        onChange={(e) => onChange({ ...step, correctAnswer: e.target.value })}
        placeholder="e.g. a = F/m   or   3.5   or   6 N"
      />
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "4px" }}>
        <p style={{ ...se.note, margin: 0, flex: 1 }}>
          Case-insensitive · LaTeX spaces ignored · Numeric within tolerance · | for alternatives (e.g. √5|sqrt5|2.24)
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", color: "#6a1b9a", whiteSpace: "nowrap" }}>
          Tolerance
          <input
            type="number"
            step="0.001"
            min="0"
            style={{ width: "68px", padding: "4px 6px", border: "1px solid #ce93d8", borderRadius: "4px", fontSize: "13px" }}
            value={step.tolerance ?? 0.01}
            onChange={(e) => onChange({ ...step, tolerance: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </div>

      <label style={se.label}>Hint (shown after first wrong answer — supports $LaTeX$)</label>
      <textarea
        style={se.textarea}
        rows={2}
        value={step.hint}
        onChange={(e) => onChange({ ...step, hint: e.target.value })}
        placeholder="e.g. Divide both sides by $m$"
      />
      {step.hint.trim() && (
        <div style={se.preview}>
          <KaTeXRenderer text={step.hint} />
        </div>
      )}
    </div>
  );
}

// ─── Blank Editor ────────────────────────────────────────────────────────────

function BlankEditor({ blank, index, total, onChange, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div style={be.card}>
      <div style={be.header}>
        <span style={be.blankLabel}>[{blank.id}] Blank {index + 1}</span>
        <div style={be.controls}>
          <button onClick={onMoveUp}   disabled={index === 0}          style={be.ctrlBtn} title="Move up">↑</button>
          <button onClick={onMoveDown} disabled={index === total - 1}  style={be.ctrlBtn} title="Move down">↓</button>
          <button onClick={onDelete}                                    style={{ ...be.ctrlBtn, color: "#c62828" }} title="Delete">✕</button>
        </div>
      </div>
      <label style={be.label}>Correct Answer <span style={{ color: "#c62828" }}>*</span></label>
      <input
        style={be.input}
        value={blank.answer}
        onChange={(e) => onChange({ ...blank, answer: e.target.value })}
        placeholder='e.g. hypotenuse   or   6 cm   or   Newton'
      />
      <p style={be.note}>Case-insensitive. "5 cm" and "5cm" both accepted. Use | for alternatives, e.g. "a|b" accepts either.</p>
      <label style={be.label}>Hint (shown after first wrong attempt — optional)</label>
      <input
        style={be.input}
        value={blank.hint}
        onChange={(e) => onChange({ ...blank, hint: e.target.value })}
        placeholder='e.g. This is the longest side of the triangle'
      />
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "#fff", borderRadius: "12px", width: "600px",
    maxWidth: "95vw", maxHeight: "92vh", display: "flex", flexDirection: "column",
    boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 24px", borderBottom: "1px solid #eee",
  },
  title: { margin: 0, fontSize: "18px", color: "#0f3460" },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999", lineHeight: 1 },
  body: { padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "20px" },
  label: { display: "block", fontSize: "12px", fontWeight: "700", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" },
  textarea: { width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" },
  input: { padding: "8px 10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", width: "100%", boxSizing: "border-box" },
  preview: { marginTop: "8px", padding: "10px 14px", background: "#f8f9fa", borderRadius: "6px", fontSize: "15px", lineHeight: "1.7", borderLeft: "3px solid #0f3460", whiteSpace: "pre-line" },
  previewLabel: { fontSize: "10px", color: "#aaa", fontWeight: "700", textTransform: "uppercase", marginRight: "6px" },
  radioGroup: { display: "flex", gap: "24px" },
  radio: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", cursor: "pointer" },
  optionRow: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" },
  letter: { width: "28px", height: "28px", borderRadius: "50%", background: "#0f3460", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "700", flexShrink: 0 },
  correctLabel: { display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", whiteSpace: "nowrap", cursor: "pointer" },
  stepsSection: { borderTop: "2px solid #f0f0f0", paddingTop: "16px" },
  stepsHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" },
  stepsEmpty: { fontSize: "13px", color: "#aaa", fontStyle: "italic", margin: "8px 0 0" },
  addStepBtn: { padding: "6px 14px", background: "#6a1b9a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
  footer: { padding: "16px 24px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: "10px" },
  cancelBtn: { padding: "8px 18px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: "6px", cursor: "pointer", fontSize: "14px" },
  saveBtn: { padding: "8px 22px", background: "#0f3460", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  metaRow:   { display: "flex", gap: "16px", flexWrap: "wrap" },
  metaField: { display: "flex", flexDirection: "column", flex: 1, minWidth: "120px" },
  select:    { padding: "8px 10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", background: "#fff", cursor: "pointer" },
  required:  { color: "#c62828" },
  uploadBtn: { padding: "8px 16px", background: "#f5f5f5", border: "1px dashed #bbb", borderRadius: "6px", cursor: "pointer", fontSize: "14px", color: "#555" },
  imgPreviewBox: { display: "inline-flex", flexDirection: "column", gap: "8px" },
  imgPreview: { maxWidth: "100%", maxHeight: "220px", borderRadius: "6px", border: "1px solid #ddd", objectFit: "contain" },
  imgBtnRow: { display: "flex", gap: "8px" },
  replaceBtn: { padding: "5px 12px", background: "#f5f5f5", border: "1px solid #ccc", borderRadius: "5px", cursor: "pointer", fontSize: "13px" },
  removeBtn: { padding: "5px 12px", background: "#fff0f0", border: "1px solid #ffcdd2", color: "#c62828", borderRadius: "5px", cursor: "pointer", fontSize: "13px" },
  fitbNote: { margin: "0 0 8px", padding: "8px 12px", background: "#e8f4fd", borderLeft: "3px solid #0f3460", borderRadius: "0 4px 4px 0", fontSize: "13px", color: "#0f3460", lineHeight: "1.5" },
  chapterNote: { margin: "0 0 8px", padding: "8px 12px", background: "#fff8e1", borderLeft: "3px solid #f9a825", borderRadius: "0 4px 4px 0", fontSize: "13px", color: "#5d4037", lineHeight: "1.5" },
  chapterHint: { margin: "4px 0 0", fontSize: "11px", color: "#999", fontStyle: "italic" },
  blanksSection: { borderTop: "2px solid #f0f0f0", paddingTop: "16px" },
  blanksHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" },
  blanksEmpty: { fontSize: "13px", color: "#aaa", fontStyle: "italic", margin: "8px 0 0" },
  addBlankBtn: { padding: "6px 14px", background: "#6a1b9a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" },
};

const be = {
  card: { background: "#f3e5f5", border: "1px solid #ce93d8", borderRadius: "8px", padding: "14px 16px", marginBottom: "10px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" },
  blankLabel: { fontSize: "13px", fontWeight: "700", color: "#6a1b9a", letterSpacing: "0.3px" },
  controls: { display: "flex", gap: "4px" },
  ctrlBtn: { background: "#fff", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", width: "28px", height: "28px", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center" },
  label: { display: "block", fontSize: "11px", fontWeight: "700", color: "#6a1b9a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px", marginTop: "8px" },
  input: { width: "100%", padding: "7px 10px", border: "1px solid #ce93d8", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" },
  note: { margin: "3px 0 0", fontSize: "11px", color: "#9c4dcc", fontStyle: "italic" },
};

const se = {
  card: { background: "#faf5ff", border: "1px solid #e1bee7", borderRadius: "8px", padding: "16px", marginBottom: "12px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" },
  stepLabel: { fontSize: "13px", fontWeight: "700", color: "#6a1b9a", textTransform: "uppercase", letterSpacing: "0.5px" },
  controls: { display: "flex", gap: "4px" },
  ctrlBtn: { background: "#fff", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", width: "28px", height: "28px", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center" },
  label: { display: "block", fontSize: "11px", fontWeight: "700", color: "#6a1b9a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px", marginTop: "10px" },
  textarea: { width: "100%", padding: "8px 10px", border: "1px solid #ce93d8", borderRadius: "6px", fontSize: "14px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" },
  input: { width: "100%", padding: "8px 10px", border: "1px solid #ce93d8", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" },
  preview: { marginTop: "6px", padding: "8px 12px", background: "#fff", borderRadius: "6px", fontSize: "14px", lineHeight: "1.7", border: "1px solid #e1bee7" },
  note: { margin: "4px 0 0", fontSize: "11px", color: "#999", fontStyle: "italic" },
};
