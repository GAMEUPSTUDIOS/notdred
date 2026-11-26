// The page's build: dist/core.wasm (wasm32-wasi reactor). JavaScript writes a UTF-8 request into memory from
// nd_alloc, calls nd_call(ptr,len), and reads nd_result_len() bytes at the returned pointer (valid until the next call).
#include "api.h"
#include <cstdlib>
static std::string result;
extern "C" {
__attribute__((export_name("nd_alloc"))) void* nd_alloc(size_t n){return std::malloc(n?n:1);}
__attribute__((export_name("nd_free"))) void nd_free(void* p){std::free(p);}
__attribute__((export_name("nd_call"))) const char* nd_call(const char* p,size_t n){result=nd::call(std::string(p,n));return result.data();}
__attribute__((export_name("nd_result_len"))) size_t nd_result_len(){return result.size();}
}
