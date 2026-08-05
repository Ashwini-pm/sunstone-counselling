-- Strip base64 padding from access tokens.
--
-- 002 generated tokens with base64 '=' padding. In a URL path that becomes
-- %3D, and the value no longer matches the stored token, so every link 404'd.
-- Proper base64url has no padding, so drop it at the source rather than
-- decoding defensively in every consumer.
--
-- 32 random bytes still yield 43 characters, so this costs no entropy.

update question_sets
   set access_token = replace(access_token, '=', '')
 where access_token like '%=%';

alter table question_sets
  alter column access_token
    set default replace(
                  replace(
                    replace(encode(gen_random_bytes(32), 'base64'), '+', '-'),
                  '/', '_'),
                '=', '');
