import { GameAction, GameEvent, GameState } from './types';

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'TAP_CELL': {
      const { index, timeRemaining } = action;
      const { currentGrid, mode } = state;
      const isCorrect = currentGrid.correctAnswers.includes(index);

      if (isCorrect) {
        // Score: 100 base + round(timeRemaining * 10)
        const bonus = Math.round(timeRemaining * 10);
        const scoreGain = 100 + bonus;
        const newScore = state.score + scoreGain;

        const event: GameEvent = {
          type: 'correct',
          gridIndex: state.gridIndex,
          challengeIndex: state.challengeIndex,
          timeRemaining,
          timestamp: Date.now(),
        };

        return {
          ...state,
          score: newScore,
          bitsEarned: Math.floor(newScore / 100),
          events: [...state.events, event],
        };
      } else {
        // Wrong answer
        const event: GameEvent = {
          type: 'wrong',
          gridIndex: state.gridIndex,
          challengeIndex: state.challengeIndex,
          timeRemaining,
          timestamp: Date.now(),
        };


        const newHearts = state.hearts - 1;
        if (newHearts <= 0) {
          return {
            ...state,
            hearts: 0,
            phase: 'gameOver',
            bitsEarned: Math.floor(state.score / 100),
            events: [...state.events, event],
          };
        }

        return {
          ...state,
          hearts: newHearts,
          events: [...state.events, event],
        };
      }
    }

    case 'TIMEOUT': {
      const event: GameEvent = {
        type: 'timeout',
        gridIndex: state.gridIndex,
        challengeIndex: state.challengeIndex,
        timeRemaining: 0,
        timestamp: Date.now(),
      };


      const newHearts = state.hearts - 1;
      if (newHearts <= 0) {
        return {
          ...state,
          hearts: 0,
          phase: 'gameOver',
          bitsEarned: Math.floor(state.score / 100),
          events: [...state.events, event],
        };
      }

      return {
        ...state,
        hearts: newHearts,
        events: [...state.events, event],
      };
    }

    case 'ADVANCE_GRID': {
      const { nextGrid, nextChallengeType, nextInstruction } = action;
      const nextGridIndex = state.gridIndex + 1;

      // Grid 4 (0-indexed) was the last grid in this challenge
      if (nextGridIndex >= 5) {
        return {
          ...state,
          gridIndex: 0,
          challengeIndex: state.challengeIndex + 1,
          currentGrid: nextGrid,
          currentChallengeType: nextChallengeType ?? state.currentChallengeType,
          currentInstruction: nextInstruction ?? state.currentInstruction,
        };
      }

      return {
        ...state,
        gridIndex: nextGridIndex,
        currentGrid: nextGrid,
      };
    }

    default:
      return state;
  }
}
