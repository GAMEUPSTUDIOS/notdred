// The server's build: build/core.node. call(requestJSON) → replyJSON.
#include "node_api.h"
#include "api.h"
static napi_value Call(napi_env env,napi_callback_info info){size_t argc=1;napi_value arg;napi_get_cb_info(env,info,&argc,&arg,nullptr,nullptr);
 size_t len=0;napi_get_value_string_utf8(env,arg,nullptr,0,&len);std::string in(len,'\0');napi_get_value_string_utf8(env,arg,in.data(),len+1,&len);
 std::string out=nd::call(in);napi_value r;napi_create_string_utf8(env,out.data(),out.size(),&r);return r;}
NAPI_MODULE_INIT(){napi_value fn;napi_create_function(env,"call",NAPI_AUTO_LENGTH,Call,nullptr,&fn);napi_set_named_property(env,exports,"call",fn);return exports;}
