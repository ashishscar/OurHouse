// A cached consumer snapshot must belong to the current sign-in subject.
export const cacheMatchesSession=(cached,auth)=>!auth?.enabled||!!auth.subject&&cached?.authSubject===auth.subject;
