import type { Clock, DiaryRepository, DiaryState } from "../domain/diary";
import { trainingState, validateReminder, validateTraining, type TrainingRecord, type TrainingReminder, type TrainingReminderAdapter, type TrainingState } from "../domain/training";
import type { FatLossDiary } from "./cycleDiary";

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
  async function editableRecord(state: DiaryState & { training: TrainingState }, recordId?: string) {
    const snapshot = await diary.openDiary();
    const cycle = snapshot.activeCycle;
    if (!cycle || snapshot.today < cycle.startDate || snapshot.today > cycle.endDate) throw new Error("请先创建包含今天的进行中周期");
    const record = recordId ? state.training.records.find((item) => item.id === recordId) : undefined;
    if (recordId && !record) throw new Error("未找到训练记录");
    if (record && (record.date !== snapshot.today || record.cycleId !== cycle.id)) throw new Error("结束日期和已归档周期的训练内容、完成状态和感受不可修改或删除");
    return { cycle, record, today: snapshot.today };
  }
  return {
    capability: () => reminders.capability(),
    open: () => run(async () => {
      const stored = await repository.read();
      const state = trainingState(stored?.training);
      let warning = "";
      // Also reconcile a saved OFF setting after interruption before native cancellation.
      // An untouched old state must never create or even request notification tasks.
      if (stored?.training) {
        try { await reminders.replace(state.reminder); }
        catch (error) { warning = error instanceof Error ? error.message : "训练提醒同步失败，请重新保存提醒设置"; }
      }
      return { ...state, warning };
    }),
    savePlan: (input: { id?: string; title: string; content: string }) => run(async () => {
      const fields = validateTraining(input.title, input.content);
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
    saveRecord: (input: { id?: string; planId?: string; date?: string; title: string; content: string; completed: boolean; feeling: string }) => run(async () => {
      // Normalize cycle state before reading the state to be written.
      await diary.openDiary();
      const state = await read();
      const { cycle, record, today } = await editableRecord(state, input.id);
      if (input.date && input.date !== today) throw new Error("只能记录今天的训练");
      const fields = validateTraining(input.title, input.content);
      if (typeof input.completed !== "boolean") throw new Error("请选择训练完成状态");
      if (typeof input.feeling !== "string" || input.feeling.trim().length > 2000) throw new Error("训练感受最多 2000 字");
      if (input.planId && !state.training.plans.some((plan) => plan.id === input.planId && (!plan.deletedAt || record?.planId === plan.id))) throw new Error("未找到训练计划");
      const now = timestamp();
      const values = { ...fields, completed: input.completed, feeling: input.feeling.trim() };
      if (record) Object.assign(record, values, { updatedAt: now, revision: record.revision + 1 });
      else {
        const created: TrainingRecord = { ...values, id: id("training-record"), ownerId: "local-user", cycleId: cycle.id, date: today, planId: input.planId, createdAt: now, updatedAt: now, revision: 1, syncState: "local" };
        state.training.records.push(created);
      }
      await repository.write(state);
      return diary.openDiary({ cycleId: cycle.id, date: today });
    }),
    deleteRecord: (recordId: string) => run(async () => {
      await diary.openDiary();
      const state = await read();
      const { cycle, today } = await editableRecord(state, recordId);
      state.training.records = state.training.records.filter((record) => record.id !== recordId);
      await repository.write(state);
      return diary.openDiary({ cycleId: cycle.id, date: today });
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
