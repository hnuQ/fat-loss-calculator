import type { Clock, DiaryRepository, DiaryState } from "../domain/diary";
import { trainedRecord, trainingRecordTitle, trainingState, validateReminder, validateTraining, validateTrainingContent, type TrainingBodyPart, type TrainingRecord, type TrainingReminder, type TrainingReminderAdapter, type TrainingState, type TrainingWeek } from "../domain/training";
import type { FatLossDiary } from "./cycleDiary";
import { addCalendarDays, assertLocalDate, toCalendarDayNumber } from "../domain/cycle";

export function createTrainingDiary(dependencies: { repository: DiaryRepository; clock: Clock; diary: FatLossDiary; reminders: TrainingReminderAdapter }) {
  const { repository, clock, diary, reminders } = dependencies;
  const timestamp = () => clock.now?.() ?? new Date().toISOString();
  const id = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let pending: Promise<unknown> = Promise.resolve();
  // Serialize reminders and training writes; a second save cannot race a permission dialog.
  function run<T>(action: () => Promise<T>): Promise<T> {
    const next = pending.then(action, action);
    pending = next.catch(() => undefined);
    return next;
  }
  async function read() {
    const state: DiaryState = await repository.read() ?? { meals: [], weights: [] };
    state.training = trainingState(state.training);
    return state as DiaryState & { training: TrainingState };
  }
  /** 选定周期内的实际记录才可补录、修改和删除；日期须在周期内且不晚于今天。 */
  function editableCycle(state: DiaryState & { training: TrainingState }, cycleId: string, today: string) {
    const cycle = state.cycles?.find((item) => item.id === cycleId);
    if (!cycle) throw new Error("未找到减脂周期");
    return cycle;
  }
  function assertRecordDate(date: string, cycle: { startDate: string; endDate: string }, today: string) {
    assertLocalDate(date, "训练日期");
    if (date > today) throw new Error("不能记录未来的训练");
    if (date < cycle.startDate || date > cycle.endDate) throw new Error("训练日期不在所选周期内");
  }
  return {
    capability: () => reminders.capability(),
    requestExactPermission: async () => { await reminders.requestExactPermission?.(); },
    // 试听与响铃只作用于原生播放器，不保存设置、不安排任务、不消费到时事件。
    listRingtones: () => run(async () => reminders.listRingtones ? await reminders.listRingtones() : []),
    previewSound: (uri?: string) => run(async () => { await reminders.previewSound?.(uri); }),
    stopPreview: () => run(async () => { await reminders.stopPreview?.(); }),
    stopRinging: () => run(async () => { await reminders.stopRinging?.(); }),
    openWeek: (selection: { cycleId: string; date: string }): Promise<TrainingWeek> => run(async () => {
      assertLocalDate(selection.date);
      const state = await read();
      const cycle = editableCycle(state, selection.cycleId, clock.today());
      const monday = addCalendarDays(selection.date, -((toCalendarDayNumber(selection.date) + 3) % 7));
      return { days: Array.from({ length: 7 }, (_, index) => {
        const date = addCalendarDays(monday, index);
        // 旧未完成记录不算已练，未记录和旧排期日期保持空白。
        const records = state.training.records.filter((record) => record.cycleId === cycle.id && record.date === date && trainedRecord(record));
        return { date, inCycle: date >= cycle.startDate && date <= cycle.endDate, records };
      }) };
    }),
    open: () => run(async () => {
      const stored = await repository.read();
      const state = trainingState(stored?.training);
      let warning = "";
      // Also reconcile a saved OFF setting after interruption before native cancellation.
      // An untouched old state must never create or even request notification tasks.
      if (stored?.training) {
        try { await reminders.refreshCapability?.(); await reminders.replace(state.reminder); }
        catch (error) { warning = error instanceof Error ? error.message : "训练提醒同步失败，请重新保存提醒设置"; }
      }
      else await reminders.refreshCapability?.();
      return { ...state, warning };
    }),
    savePlan: (input: { id?: string; title: string; content: string; bodyParts?: TrainingBodyPart[] }) => run(async () => {
      const fields = validateTraining(input.title, input.content, input.bodyParts);
      const state = await read();
      if (!state.profile) throw new Error("请先建立健康档案");
      const existing = input.id ? state.training.plans.find((item) => item.id === input.id && !item.deletedAt) : undefined;
      if (input.id && !existing) throw new Error("未找到训练计划");
      const now = timestamp();
      if (existing) Object.assign(existing, fields, { updatedAt: now, revision: existing.revision + 1 });
      else state.training.plans.push({ ...fields, id: id("training-plan"), ownerId: "local-user", createdAt: now, updatedAt: now, revision: 1, syncState: "local" });
      await repository.write(state);
      return state.training;
    }),
    deletePlan: (planId: string) => run(async () => {
      const state = await read();
      const plan = state.training.plans.find((item) => item.id === planId && !item.deletedAt);
      if (!plan) throw new Error("未找到训练计划");
      plan.deletedAt = timestamp(); plan.updatedAt = plan.deletedAt; plan.revision += 1;
      await repository.write(state);
      return state.training;
    }),
    saveRecord: (input: { id?: string; cycleId: string; planId?: string; date: string; content: string; bodyParts?: TrainingBodyPart[]; feeling: string; saveAsPlan?: boolean }) => run(async () => {
      // Normalize cycle state before reading the state to be written.
      await diary.openDiary();
      const state = await read();
      const today = clock.today();
      const cycle = editableCycle(state, input.cycleId, today);
      const existing = input.id ? state.training.records.find((item) => item.id === input.id) : undefined;
      if (input.id && !existing) throw new Error("未找到训练记录");
      if (existing && existing.cycleId !== cycle.id) throw new Error("不能把训练记录移到其他周期");
      assertRecordDate(input.date, cycle, today);
      const fields = validateTrainingContent(input.content, input.bodyParts);
      if (typeof input.feeling !== "string" || input.feeling.trim().length > 2000) throw new Error("训练感受最多 2000 字");
      const plan = input.planId ? state.training.plans.find((item) => item.id === input.planId && (!item.deletedAt || existing?.planId === item.id)) : undefined;
      if (input.planId && !plan) throw new Error("未找到训练计划");
      const now = timestamp();
      // 名称不再由用户填写：模板名称优先，其次保留旧记录名称，最后用部位组合或默认值。
      const values = { ...fields, title: trainingRecordTitle(plan?.title ?? existing?.title, fields.bodyParts), planId: plan?.id ?? existing?.planId, feeling: input.feeling.trim(), completed: true };
      if (input.saveAsPlan) state.training.plans.push({ title: values.title, content: values.content, bodyParts: [...values.bodyParts], id: id("training-plan"), ownerId: "local-user", createdAt: now, updatedAt: now, revision: 1, syncState: "local" });
      if (existing) Object.assign(existing, values, { cycleId: cycle.id, date: input.date, updatedAt: now, revision: existing.revision + 1 });
      else state.training.records.push({ ...values, id: id("training-record"), ownerId: "local-user", cycleId: cycle.id, date: input.date, createdAt: now, updatedAt: now, revision: 1, syncState: "local" });
      await repository.write(state);
      return diary.openDiary({ cycleId: cycle.id, date: input.date });
    }),
    deleteRecord: (recordId: string) => run(async () => {
      await diary.openDiary();
      const state = await read();
      const record = state.training.records.find((item) => item.id === recordId);
      if (!record) throw new Error("未找到训练记录");
      const cycle = editableCycle(state, record.cycleId, clock.today());
      if (record.date > clock.today()) throw new Error("不能删除未来的训练记录");
      state.training.records = state.training.records.filter((item) => item.id !== recordId);
      await repository.write(state);
      return diary.openDiary({ cycleId: cycle.id, date: record.date });
    }),
    saveReminder: (input: TrainingReminder) => run(async () => {
      const reminder = validateReminder(input);
      let state = await read();
      if (!state.profile) throw new Error("请先建立健康档案");
      if (reminder.enabled) {
        if (!reminders.capability().supported) throw new Error(reminders.capability().message);
        if (!await reminders.requestPermission()) throw new Error("通知权限未授权，训练提醒未启用");
        state = await read();
      }
      const previous = state.training.reminder;
      // Persist desired state first: restart reconciliation repairs an interrupted native write.
      state.training.reminder = reminder;
      await repository.write(state);
      try { await reminders.replace(reminder); }
      catch (error) {
        const latest = await read();
        latest.training.reminder = previous;
        await repository.write(latest);
        try { await reminders.replace(previous); }
        catch { throw new Error("提醒同步失败且无法恢复，请重新打开应用并保存提醒设置"); }
        throw error;
      }
      return state.training;
    }),
  };
}
