import type { DiaryRepository, DiaryState } from "../domain/diary";

function clone(state: DiaryState): DiaryState {
  return JSON.parse(JSON.stringify(state)) as DiaryState;
}

export function createInMemoryDiaryRepository(
  initialState?: DiaryState,
): DiaryRepository {
  let state = initialState ? clone(initialState) : undefined;

  return {
    async read() {
      return state ? clone(state) : undefined;
    },
    async write(nextState) {
      state = clone(nextState);
    },
  };
}
