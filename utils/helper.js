const isAfterTwoDays = (dispatchedAt) => {
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  return new Date() - new Date(dispatchedAt) >= TWO_DAYS;
};

export { isAfterTwoDays };
