<?php

namespace Shopee\Exception\Api;

use GuzzleHttp\Exception\RequestException;

class Factory
{
    public static function create($className, RequestException $exception)//: ApiException
    {
        return new $className(
            $exception->getMessage(),
            $exception->getRequest(),
            $exception->getResponse(),
            $exception,
            $exception->getHandlerContext()
        );
    }
}
