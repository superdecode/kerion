<?php

namespace Shopee\Nodes\Item\Parameters;

trait ItemTrait
{
    public function getItemId()//: int
    {
        return $this->parameters['item_id'];
    }

    /**
     * Set the Shopee's unique identifier for an item
     *
     * @param int $itemId
     * @return $this
     */
    public function setItemId($itemId)
    {
        $this->parameters['item_id'] = $itemId;

        return $this;
    }
	
    public function setItemDetailsInfo($itemId, $partnerId, $shopId)
    {
        $this->parameters['item_id'] = $itemId;
        $this->parameters['partner_id'] = $partnerId;
        $this->parameters['shopid'] = $shopId;
        $this->parameters['timestamp'] = time();

        return $this;
    }
}
