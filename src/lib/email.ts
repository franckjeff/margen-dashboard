// What counts as an email address: something@domain.ending, with no spaces and one @, at most 320 characters.
// The database checks the same rule (contacts, leads, order and quote requests, the create-user function),
// so the forms catch mistakes before saving, with a clearer message.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_EMAIL = 320;

// For an <input pattern>: the browser matches it against the whole value.
export const EMAIL_PATTERN = "[^@\\s]+@[^@\\s]+\\.[^@\\s]+";

export const EMAIL_PROBLEM = "Enter a full email address, like name@example.com.";

export const isEmail = (value: string) => {
  const email = value.trim();
  return email.length <= MAX_EMAIL && EMAIL.test(email);
};
