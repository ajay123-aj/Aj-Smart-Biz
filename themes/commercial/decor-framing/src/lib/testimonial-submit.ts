/**
 * The shape of a review submission's result, and where it starts.
 *
 * A plain module rather than part of the action, because a `'use server'` file
 * may export **async functions and nothing else** — a constant alongside the
 * action is a runtime error, not a build one, which is exactly the kind that
 * ships. So the action exports only itself, and the two things both it and the
 * form need live here.
 */

/** The text fields the form submits, echoed back so a rejection keeps them. */
export type SubmitValues = Partial<Record<TestimonialField, string>>;

export type TestimonialField =
  | 'authorName'
  | 'authorEmail'
  | 'authorPhone'
  | 'body';

/** What the form renders after a submit. `idle` is the state before the first. */
export interface SubmitState {
  status: 'idle' | 'success' | 'error';
  message: string;
  /** Field-level messages from the API, keyed by field name. */
  fieldErrors?: Partial<Record<TestimonialField, string>>;
  /**
   * What was sent, returned only when the submit failed.
   *
   * React resets an uncontrolled form once its action completes — which is
   * right after a success and wrong after a failure: a visitor told their
   * review is four characters too short should not find the whole form blank
   * and have to write it again. The fields read these back as `defaultValue`,
   * so a rejection costs them the fix and nothing else.
   */
  values?: SubmitValues;
}

export const INITIAL_SUBMIT_STATE: SubmitState = { status: 'idle', message: '' };
