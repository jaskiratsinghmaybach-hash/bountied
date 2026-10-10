export const REVIEW_COST_USD = 0.04;
export const FREE_REVIEWS_PER_PROBLEM = 3;

export function getReviewCost(freeReviewsUsed: number): number {
  if (freeReviewsUsed < FREE_REVIEWS_PER_PROBLEM) {
    return 0;
  }
  return REVIEW_COST_USD;
}